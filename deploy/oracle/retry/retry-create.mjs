// Keeps asking Oracle Cloud for an ALWAYS FREE Ampere A1 server until capacity frees up.
//
//   npm run check   -> verifies access, prepares the free network, shows what it would create
//   npm start       -> retries every RETRY_SECONDS (default 90) until the server exists
//
// Free-only guarantees:
//   - only the VM.Standard.A1.Flex shape (Always Free-eligible), never more than the free
//     4 OCPU / 24 GB in total across your A1 servers
//   - default boot volume (~47 GB; Always Free covers 200 GB of block storage)
//   - VCN, subnet, internet gateway and security list are free networking resources
//   - it never upgrades the account or touches billing
//
// Reads credentials from ~/.oci/config (DEFAULT profile) and the SSH public key ~/.ssh/aitutor.pub.

import * as common from "oci-common";
import * as core from "oci-core";
import * as identity from "oci-identity";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const deployDir = resolve(here, "..", "..");
const CHECK_ONLY = process.argv.includes("--check");
const RETRY_SECONDS = Number(process.env.RETRY_SECONDS || 90);
const NAME = "aitutor";
const SHAPE = "VM.Standard.A1.Flex";
const FREE_A1_OCPUS = 4;
const FREE_A1_GB = 24;
// Tried in turn on each attempt; both fit inside the free allowance.
const SIZES = [
  { ocpus: 4, memoryInGBs: 24 },
  { ocpus: 2, memoryInGBs: 12 },
];

const log = (...a) => console.log(`[${new Date().toLocaleTimeString("en-IN", { hour12: false })}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const provider = new common.ConfigFileAuthenticationDetailsProvider();
const tenancy = provider.getTenantId();
const compute = new core.ComputeClient({ authenticationDetailsProvider: provider });
const network = new core.VirtualNetworkClient({ authenticationDetailsProvider: provider });
const idc = new identity.IdentityClient({ authenticationDetailsProvider: provider });
const sshKey = readFileSync(join(homedir(), ".ssh", "aitutor.pub"), "utf8").trim();

async function availabilityDomain() {
  const { items } = await idc.listAvailabilityDomains({ compartmentId: tenancy });
  if (!items.length) throw new Error("No availability domains found");
  return items[0].name;
}

/** Finds or creates a VCN with a public subnet, internet route, and ports 22/80/443 open. */
async function ensureNetwork() {
  let { items: vcns } = await network.listVcns({ compartmentId: tenancy, lifecycleState: "AVAILABLE" });
  let vcn = vcns.find((v) => v.displayName === `${NAME}-vcn`) ?? vcns[0];
  if (!vcn) {
    log("Creating network (VCN) ...");
    ({ vcn } = await network.createVcn({
      createVcnDetails: { compartmentId: tenancy, displayName: `${NAME}-vcn`, cidrBlocks: ["10.0.0.0/16"], dnsLabel: NAME },
    }));
  }

  // Internet gateway + default route to it.
  let { items: igws } = await network.listInternetGateways({ compartmentId: tenancy, vcnId: vcn.id });
  let igw = igws.find((g) => g.lifecycleState === "AVAILABLE");
  if (!igw) {
    log("Creating internet gateway ...");
    ({ internetGateway: igw } = await network.createInternetGateway({
      createInternetGatewayDetails: { compartmentId: tenancy, vcnId: vcn.id, isEnabled: true, displayName: `${NAME}-igw` },
    }));
  }
  const { routeTable } = await network.getRouteTable({ rtId: vcn.defaultRouteTableId });
  if (!routeTable.routeRules.some((r) => r.destination === "0.0.0.0/0")) {
    log("Adding internet route ...");
    await network.updateRouteTable({
      rtId: routeTable.id,
      updateRouteTableDetails: {
        routeRules: [...routeTable.routeRules, { destination: "0.0.0.0/0", destinationType: "CIDR_BLOCK", networkEntityId: igw.id }],
      },
    });
  }

  // Open 80 and 443 (22 is open by default).
  const { securityList } = await network.getSecurityList({ securityListId: vcn.defaultSecurityListId });
  const rules = [...securityList.ingressSecurityRules];
  let changed = false;
  for (const port of [22, 80, 443]) {
    const open = rules.some(
      (r) => r.source === "0.0.0.0/0" && r.protocol === "6" && r.tcpOptions?.destinationPortRange?.min <= port && r.tcpOptions?.destinationPortRange?.max >= port,
    );
    if (!open) {
      rules.push({ source: "0.0.0.0/0", protocol: "6", isStateless: false, tcpOptions: { destinationPortRange: { min: port, max: port } } });
      changed = true;
    }
  }
  if (changed) {
    log("Opening ports 22, 80, 443 ...");
    await network.updateSecurityList({ securityListId: securityList.id, updateSecurityListDetails: { ingressSecurityRules: rules } });
  }

  // Public subnet.
  const { items: subnets } = await network.listSubnets({ compartmentId: tenancy, vcnId: vcn.id, lifecycleState: "AVAILABLE" });
  let subnet = subnets.find((s) => !s.prohibitPublicIpOnVnic);
  if (!subnet) {
    log("Creating public subnet ...");
    const cidr = subnets.length ? `10.0.${subnets.length + 1}.0/24` : "10.0.0.0/24";
    ({ subnet } = await network.createSubnet({
      createSubnetDetails: {
        compartmentId: tenancy,
        vcnId: vcn.id,
        displayName: `${NAME}-public`,
        cidrBlock: cidr,
        prohibitPublicIpOnVnic: false,
        routeTableId: vcn.defaultRouteTableId,
        securityListIds: [vcn.defaultSecurityListId],
        dnsLabel: "pub",
      },
    }));
  }
  return { vcn, subnet };
}

async function ubuntuImage() {
  const { items } = await compute.listImages({
    compartmentId: tenancy,
    operatingSystem: "Canonical Ubuntu",
    operatingSystemVersion: "24.04",
    shape: SHAPE,
    sortBy: "TIMECREATED",
    sortOrder: "DESC",
  });
  const image = items.find((i) => !/minimal/i.test(i.displayName)) ?? items[0];
  if (!image) throw new Error("No Ubuntu 24.04 image found for the A1 shape");
  return image;
}

/** OCPUs and GB already used by A1 servers, so we never go past the free allowance. */
async function a1Usage() {
  const { items } = await compute.listInstances({ compartmentId: tenancy });
  const live = items.filter((i) => !["TERMINATED", "TERMINATING"].includes(i.lifecycleState));
  const a1 = live.filter((i) => i.shape === SHAPE);
  return {
    existing: live.find((i) => i.displayName === NAME),
    ocpus: a1.reduce((s, i) => s + (i.shapeConfig?.ocpus ?? 0), 0),
    gb: a1.reduce((s, i) => s + (i.shapeConfig?.memoryInGBs ?? 0), 0),
  };
}

async function publicIpOf(instanceId) {
  const { items } = await compute.listVnicAttachments({ compartmentId: tenancy, instanceId });
  for (const att of items) {
    if (!att.vnicId) continue;
    const { vnic } = await network.getVnic({ vnicId: att.vnicId });
    if (vnic.publicIp) return vnic.publicIp;
  }
  return null;
}

async function finish(instance) {
  log(`Server ${instance.displayName} is ${instance.lifecycleState}. Waiting for it to run ...`);
  let state = instance.lifecycleState;
  while (state !== "RUNNING") {
    await sleep(10_000);
    state = (await compute.getInstance({ instanceId: instance.id })).instance.lifecycleState;
  }
  let ip = null;
  for (let i = 0; i < 30 && !ip; i++) {
    ip = await publicIpOf(instance.id);
    if (!ip) await sleep(5000);
  }
  if (!ip) throw new Error("Server is running but has no public IP");
  const domain = `${ip.replaceAll(".", "-")}.sslip.io`;
  writeFileSync(join(here, "server.json"), JSON.stringify({ instanceId: instance.id, ip, domain, createdAt: new Date().toISOString() }, null, 2));
  const envPath = join(deployDir, ".env");
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, "utf8");
    writeFileSync(envPath, /^DOMAIN=.*$/m.test(env) ? env.replace(/^DOMAIN=.*$/m, `DOMAIN=${domain}`) : `${env}\nDOMAIN=${domain}\n`);
  }
  console.log("\n================ SERVER READY ================");
  console.log(`  Public IP : ${ip}`);
  console.log(`  Domain    : ${domain}  (written to deploy/.env)`);
  console.log(`  SSH       : ssh -i ~/.ssh/aitutor ubuntu@${ip}`);
  console.log("==============================================\n");
}

function isCapacityError(e) {
  const msg = `${e?.message ?? ""} ${e?.serviceCode ?? ""}`;
  return /capacity/i.test(msg) || e?.statusCode === 500;
}

/** Wi-Fi blips, DNS hiccups, timeouts: no HTTP status at all. Safe to just try again. */
function isNetworkError(e) {
  const msg = `${e?.message ?? ""} ${e?.cause?.code ?? ""} ${e?.code ?? ""}`;
  return !e?.statusCode && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket|network/i.test(msg);
}

async function main() {
  log(`Region ${provider.getRegion()?.regionId ?? "?"} · checking access ...`);
  const ad = await availabilityDomain();
  const { subnet } = await ensureNetwork();
  const image = await ubuntuImage();
  log(`Availability domain: ${ad}`);
  log(`Image: ${image.displayName}`);
  log(`Subnet: ${subnet.displayName} (${subnet.cidrBlock}), ports 22/80/443 open`);

  const usage = await a1Usage();
  if (usage.existing) {
    log(`A server named "${NAME}" already exists (${usage.existing.lifecycleState}).`);
    if (!CHECK_ONLY) await finish(usage.existing);
    return;
  }
  const sizes = SIZES.filter((s) => usage.ocpus + s.ocpus <= FREE_A1_OCPUS && usage.gb + s.memoryInGBs <= FREE_A1_GB);
  if (!sizes.length) throw new Error(`Free A1 allowance already used (${usage.ocpus} OCPU / ${usage.gb} GB). Not creating anything.`);
  log(`Will request: ${sizes.map((s) => `${s.ocpus} OCPU / ${s.memoryInGBs} GB`).join(", then ")} (Always Free)`);
  if (CHECK_ONLY) {
    log("Check OK. Run `npm start` to begin retrying.");
    return;
  }

  for (let attempt = 1; ; attempt++) {
    const size = sizes[(attempt - 1) % sizes.length];
    try {
      // Another copy of this script (laptop or the tiny server) may have succeeded meanwhile.
      if (attempt > 1) {
        const now = await a1Usage();
        if (now.existing) {
          log(`"${NAME}" now exists (${now.existing.lifecycleState}), created elsewhere.`);
          await finish(now.existing);
          return;
        }
      }
      log(`Attempt ${attempt}: ${size.ocpus} OCPU / ${size.memoryInGBs} GB ...`);
      const { instance } = await compute.launchInstance({
        launchInstanceDetails: {
          compartmentId: tenancy,
          availabilityDomain: ad,
          displayName: NAME,
          shape: SHAPE,
          shapeConfig: size,
          sourceDetails: { sourceType: "image", imageId: image.id },
          createVnicDetails: { subnetId: subnet.id, assignPublicIp: true },
          metadata: { ssh_authorized_keys: sshKey },
        },
      });
      log("Capacity found. Server is being created.");
      await finish(instance);
      return;
    } catch (e) {
      if (e?.statusCode === 429) {
        log("Oracle says slow down (429). Waiting 5 minutes ...");
        await sleep(300_000);
      } else if (isCapacityError(e)) {
        const wait = RETRY_SECONDS * 1000 + Math.floor(Math.random() * 15_000);
        log(`Out of capacity. Next try in ~${Math.round(wait / 1000)} s.`);
        await sleep(wait);
      } else if (isNetworkError(e)) {
        log(`Network problem (${e?.message ?? e}). Retrying in 60 s.`);
        await sleep(60_000);
      } else {
        console.error(`Stopping on an unexpected error (${e?.statusCode ?? ""} ${e?.serviceCode ?? ""}): ${e?.message ?? e}`);
        process.exit(1);
      }
    }
  }
}

main().catch((e) => {
  console.error(`Failed: ${e?.statusCode ?? ""} ${e?.serviceCode ?? ""} ${e?.message ?? e}`);
  process.exit(1);
});
