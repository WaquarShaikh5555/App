# Getting started — what you have to do

The app is installed from an APK and talks to the backend you run. There is nothing to
configure inside the code: the app asks your phone where the backend is, and you can
change that address at any time from inside the app.

You need three things:

1. the APK, on your phone;
2. the backend, running on your computer;
3. both of them on the **same Wi-Fi**.

---

## 1. Install the app

Download and open this on the phone:

**https://github.com/WaquarShaikh5555/App/releases/download/apk-latest/OrderConfirm-release.apk**

Android will warn that the file is from an unknown source — allow it for this install.

> This installs straight over an older OrderConfirm: every build is signed with the same
> key. If Android does say **"App not installed"**, uninstall the old copy first and try
> again.

## 2. Start the backend

On your computer (Node 18 or newer):

```bash
cd backend
npm install
npm run dev
```

That is the whole setup. No database, no `.env`, no API keys — it starts in mock mode and
prints:

```
OrderConfirm backend listening on 0.0.0.0:3000 (Shopify 2026-07, WhatsApp v26.0, mockMode=true)
```

Leave that window open. Data lives in memory, so restarting the server clears the accounts
you created.

Keep your computer awake, and allow Node through the firewall if Windows asks.

## 3. Open the app

On first launch the app scans your Wi-Fi for that server and reports:

> **Found your server** — Sign in below, or create an account if you have not set one up yet.

It is now pointing at your computer. If it does not find it, see step 5.

## 4. Create your account

Tap **New here? Create an account** under the sign-in button. Fill in name, business name,
email and a password of at least 8 characters. You land on the dashboard straight away —
the first account you create is the owner of its own organisation.

Signing in later uses the same email and password.

## 5. If the app cannot find your server

**Settings → Server** (also reachable from the footer of the sign-in screen):

- Tap **Find it on my Wi-Fi** to scan again;
- or type the address yourself and tap **Test connection**:
  `http://192.168.1.5:3000` — that is your computer's address, and the port is 3000.

To find your computer's address:

| Your computer | Command |
|---|---|
| Windows | `ipconfig` → look for *IPv4 Address* under your Wi-Fi adapter |
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |

**Test connection** tells you exactly what is wrong — nothing listening, wrong address, a
different server, or a timeout — instead of "Network Error". Addresses beginning with
`http://` work in this build because cleartext traffic is enabled for local development.

If your phone and computer cannot be on the same network, run `ngrok http 3000` on the
computer and enter the `https://...` address it prints. That works over mobile data too.

## 6. Google sign-in (optional)

The **Continue with Google** button only appears once you supply your own Google OAuth
credentials — the repository has none, and none can be shared. Until then, email and
password works normally.

To turn it on, in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
create an OAuth client ID of type **Web application** (name: OrderConfirm) and add this
redirect URI:

```
com.orderconfirm.merchant:/oauthredirect
```

Then send me the client ID (the `...apps.googleusercontent.com` string, not the secret) and
I will wire it into the app and the backend and build a new APK. On the backend side it
becomes `GOOGLE_CLIENT_ID`; the server checks that every Google token was issued for your
app before accepting it.

The values the console asks for:

| Field | Value |
|---|---|
| Package name | `com.orderconfirm.merchant` |
| Redirect URI | `com.orderconfirm.merchant:/oauthredirect` |
| Signing certificate SHA-1 | `EF:AA:2A:79:B8:4B:AB:D4:F7:85:28:E0:1D:E3:42:14:8D:03:F8:BB` |

Every build also prints these under "Google sign-in setup" in its run summary, so if the
SHA-1 ever changes, that page is the current value.

---

## Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| "The phone could not reach 10.0.2.2:3000" | Nothing is running at the default address | Start the backend, then **Settings → Server → Find it on my Wi-Fi** |
| "Nothing is listening on ..." | The address is right, the server is not running | Run `npm run dev` in `backend/` |
| "Could not find ..." | Typo in the address | Re-enter it, or scan again |
| "did not respond in time" | Server still starting, or firewall | Wait a few seconds and retry; allow Node through the firewall |
| "Reached … but it did not answer like the OrderConfirm backend" | Something else is on that port | Use port 3000, or stop whatever else is running |
| "Email or password is incorrect" | Wrong details, or the server was restarted (memory store) | Create the account again |
| "App not installed" | An older copy with a different signature | Uninstall the old app, then install |

Anything else: **Settings → Server → Test connection** prints a sentence explaining the
problem, and that sentence is what tells us where the trouble is.
