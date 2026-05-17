import fp from "fastify-plugin";
import * as admin from "firebase-admin";
import serviceAccount from "./config/union-trade-flutter-1689448d340f.json";

function initFirebase(): boolean {
  if (admin.apps.length) return true;

  try {
    const credentials: any = serviceAccount;

    // Fix escaped newlines in private key
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }

    admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });

    console.log("Firebase initialized");
    return true;
  } catch (err) {
    console.error("Firebase initialization failed:", err);
    return false;
  }
}

export default fp(async (fastify) => {
  const isInitialized = initFirebase();

  if (isInitialized) {
    fastify.log.info("Push notifications ready");
  } else {
    fastify.log.warn("Push notifications not configured");
  }

  fastify.decorate("sendDataPush", async (token, data) => {
    if (!admin.apps.length) {
      return { success: false, error: "Push notifications not configured" };
    }

    try {
      const messageId = await admin.messaging().send({
        token,
        notification: {
          title: data.title || "New Message",
          body: data.body || "You have a new message!",
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      });

      return { success: true, messageId };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  });
});