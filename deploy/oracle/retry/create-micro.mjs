// Creates the tiny ALWAYS FREE helper server (VM.Standard.E2.1.Micro: 1/8 OCPU, 1 GB) that runs
// the retry loop 24/7, so the laptop can be switched off. Too small for the tutor app itself.
//   node create-micro.mjs
// Free-only: refuses if you already have 2 Micro servers (the Always Free limit).
import * as common from "oci-common";
import * as core from "oci-core";
import * as identity from "oci-identity";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NAME = "aitutor-helper";
const SHAPE = "VM.Standard.E2.1.Micro";
const log = (...a) => console.log(`[${new Date().toLocaleTimeString("en-IN", { hour12: false })}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const provider = new common.ConfigFileAuthenticationDetailsProvider();
const tenancy = provider.getTenantId();
const compute = new core.ComputeClient({ authenticationDetailsProvider: provider });
const network = new core.VirtualNetworkClient({ authenticationDetailsProvider: provider });
const idc = new identity.IdentityClient({ authenticationDetailsProvider: provider });
const sshKey = readFileSync(join(homedir(), ".ssh", "aitutor.pub"), "utf8").trim();

const { items: ads } = await idc.listAvailabilityDomains({ compartmentId: tenancy });
const { items: instances } = await compute.listInstances({ compartmentId: tenancy });
const live = instances.filter((i) => !["TERMINATED", "TERMINATING"].includes(i.lifecycleState));
let instance = live.find((i) => i.displayName === NAME);

if (!instance) {
  const micros = live.filter((i) => i.shape === SHAPE).length;
  if (micros >= 2) throw new Error("You already have 2 Micro servers (the Always Free limit). Not creating another.");

  const { items: vcns } = await network.listVcns({ compartmentId: tenancy, lifecycleState: "AVAILABLE" });
  const vcn = vcns.find((v) => v.displayName === "aitutor-vcn") ?? vcns[0];
  if (!vcn) throw new Error("No network yet. Run `npm run check` first.");
  const { items: subnets } = await network.listSubnets({ compartmentId: tenancy, vcnId: vcn.id, lifecycleState: "AVAILABLE" });
  const subnet = subnets.find((s) => !s.prohibitPublicIpOnVnic);
  if (!subnet) throw new Error("No public subnet. Run `npm run check` first.");

  const { items: images } = await compute.listImages({
    compartmentId: tenancy,
    operatingSystem: "Canonical Ubuntu",
    operatingSystemVersion: "24.04",
    shape: SHAPE,
    sortBy: "TIMECREATED",
    sortOrder: "DESC",
  });
  const image = images.find((i) => /minimal/i.test(i.displayName)) ?? images[0]; // minimal = lighter for 1 GB
  if (!image) throw new Error("No Ubuntu 24.04 image for the Micro shape");

  for (const ad of [...ads, ...ads, ...ads]) {
    try {
      log(`Creating ${NAME} (${SHAPE}, Always Free) in ${ad.name} with ${image.displayName} ...`);
      ({ instance } = await compute.launchInstance({
        launchInstanceDetails: {
          compartmentId: tenancy,
          availabilityDomain: ad.name,
          displayName: NAME,
          shape: SHAPE,
          sourceDetails: { sourceType: "image", imageId: image.id },
          createVnicDetails: { subnetId: subnet.id, assignPublicIp: true },
          metadata: { ssh_authorized_keys: sshKey },
        },
      }));
      break;
    } catch (e) {
      log(`Could not create in ${ad.name}: ${e?.message ?? e}`);
      // 429 = the account's request rate limit (often the retry loop running elsewhere). Wait it out.
      if (e?.statusCode === 429 || /too many requests/i.test(e?.message ?? "")) {
        log("Rate limited; waiting 60 s ...");
        await sleep(60_000);
      }
    }
  }
  if (!instance) throw new Error("No capacity for the Micro shape right now. Try again later.");
}

log(`Waiting for ${NAME} to run ...`);
while (instance.lifecycleState !== "RUNNING") {
  await sleep(10_000);
  ({ instance } = await compute.getInstance({ instanceId: instance.id }));
}
let ip = null;
for (let i = 0; i < 30 && !ip; i++) {
  const { items } = await compute.listVnicAttachments({ compartmentId: tenancy, instanceId: instance.id });
  for (const att of items) {
    if (!att.vnicId) continue;
    const { vnic } = await network.getVnic({ vnicId: att.vnicId });
    if (vnic.publicIp) ip = vnic.publicIp;
  }
  if (!ip) await sleep(5000);
}
if (!ip) throw new Error("Helper is running but has no public IP");
writeFileSync(join(here, "helper.json"), JSON.stringify({ instanceId: instance.id, ip }, null, 2));
log(`HELPER READY: ${ip}  (ssh -i ~/.ssh/aitutor ubuntu@${ip})`);
