---
description: Deploy the application (Server to Cloud Run, Client to Firebase)
---

# Deploy Server

1. Navigate to the server directory
2. Deploy to Cloud Run using source deploy
   ```bash
   cd server
   gcloud run deploy quiz-server --source . --region europe-west1 --allow-unauthenticated
   ```

# Deploy Client

1. Navigate to the client directory
2. Build the client
   ```bash
   cd client
   npm install
   npm run build
   ```
3. Deploy to Firebase Hosting
   ```bash
   cd client
   npx firebase deploy --only hosting
   ```
