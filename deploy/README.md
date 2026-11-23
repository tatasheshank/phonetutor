# Deploying to Oracle Cloud (Always Free)

One free ARM server runs everything: the web app, the tutor worker, and HTTPS. Accounts, payments and session costs stay in `deploy/data/` on the server, backed up daily.

This is a **staging** setup. The test account, OTPs in the log and the test payment button are on (`ALLOW_TEST_FEATURES=true`). Turn them off, and set up SMS and Razorpay, before real learners use it.

## 1. Create the server (Oracle console, about 15 minutes)

1. Sign up at **oracle.com/cloud/free**. Choose **India South (Hyderabad)** or **India West (Mumbai)** as your home region. This can't be changed later. A card is needed for verification; Always Free resources are not charged.
2. **Menu → Compute → Instances → Create instance**
   - Name: `aitutor`
   - Image: **Canonical Ubuntu 24.04** (or 22.04)
   - Shape: **Ampere → VM.Standard.A1.Flex**, **4 OCPUs, 24 GB memory** (the whole Always Free allowance)
   - Networking: keep the default new VCN and public subnet, with **Assign a public IPv4 address** on
   - SSH keys: **Generate a key pair for me → Save private key**. Keep this file safe; it's your only way in.
   - Click **Create**. If it says *Out of capacity*, try another availability domain in the same screen, or retry later.
3. Open ports 80 and 443 to the internet:
   **Instance → Primary VNIC → Subnet → Default Security List → Add Ingress Rules**
   - Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port **80**
   - Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port **443**
4. Copy the instance's **Public IP address**.

## 2. Fill in the settings (on your laptop)

In the project's `deploy` folder, copy each example file and fill it in:

| File | What goes in it |
| --- | --- |
| `deploy/.env` | `DOMAIN=` your IP with dashes + `.sslip.io`, e.g. `140-238-1-2.sslip.io` (free, no sign-up) |
| `deploy/web.env` | LiveKit keys, a **new long** `ADMIN_PASSWORD`, price, Razorpay keys if you have them |
| `deploy/agent.env` | LiveKit keys and `SARVAM_API_KEY` |

```powershell
Copy-Item deploy\.env.example deploy\.env
```

```powershell
Copy-Item deploy\web.env.example deploy\web.env
```

```powershell
Copy-Item deploy\agent.env.example deploy\agent.env
```

These three files are never put in the Docker images or in git.

## 3. Set up the server once, then deploy

Windows may block the downloaded key file as "too open" for SSH. If `ssh` complains about permissions, run this once (with your key's path):

```powershell
icacls C:\path\to\ssh-key.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

One-time setup (installs Docker, opens the firewall, adds swap and a daily backup):

```powershell
.\deploy\upload.ps1 -Ip 140.238.1.2 -Key C:\path\to\ssh-key.key -SetupOnly
```

Deploy (and run again after every change):

```powershell
.\deploy\upload.ps1 -Ip 140.238.1.2 -Key C:\path\to\ssh-key.key
```

The first build takes 5–10 minutes. Then open `https://<your DOMAIN>`; the certificate is issued on the first visit.

## Everyday commands (on the server, after `ssh -i <key> ubuntu@<ip>`)

| What | Command |
| --- | --- |
| Is everything running? | `docker compose -f ~/aitutor/deploy/docker-compose.yml ps` |
| Live logs (OTP codes appear in `web`) | `docker compose -f ~/aitutor/deploy/docker-compose.yml logs -f web agent` |
| Restart | `docker compose -f ~/aitutor/deploy/docker-compose.yml restart` |
| Backups | `ls ~/aitutor-backups` |

## Before real learners

- [ ] `ALLOW_TEST_FEATURES=false` in `deploy/web.env`
- [ ] SMS for OTP (MSG91 with DLT-registered templates). Without it, nobody can sign in once test features are off.
- [ ] Razorpay live keys and KYC activation
- [ ] Your own domain instead of sslip.io
- [ ] Move data to PostgreSQL when you add a second server (M4)
- [ ] `ALLOW_DRAFT_LESSONS=false` once lessons are native-reviewed
