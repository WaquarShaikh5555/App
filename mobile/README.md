# OrderConfirm Mobile App

React Native / Expo / TypeScript — merchant client, builds to APK.

## Setup
```bash
npm install
```

Set backend URL:
```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 npx expo start
# For physical device via tunnel:
EXPO_PUBLIC_API_URL=https://your-ngrok.ngrok.io npx expo start --tunnel
```

## EAS Build APK
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
# Download APK from Expo dashboard
# Install: adb install app.apk
```

## Env separation
- `eas.json` preview profile => apk, EXPO_PUBLIC_API_URL staging
- `app.config.js` reads EXPO_PUBLIC_API_URL or extra.apiUrl
- Never hardcode API URL

## Features
- Auth via SecureStore
- Push notifications via expo-notifications + FCM, deep link to order
- Offline: cache dashboard/orders, banner, read-only
- Screens: Login, Dashboard, Orders, Order Detail (masked phone + reveal logged), Settings, Connect Shopify/WhatsApp, Template status

## Deep linking
- Scheme: orderconfirm://
- orderconfirm://order/:id
- orderconfirm://shopify-connected
- orderconfirm://whatsapp-connected

## Permissions
- INTERNET, POST_NOTIFICATIONS only

## Testing
- Auth token refresh
- Deep link from push opens correct order
- Offline read-only
- Reconnect flows
```
