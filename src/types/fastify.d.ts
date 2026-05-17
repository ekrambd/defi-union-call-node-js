import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    sendDataPush: (
      token: string,
      data: Record<string, string>
    ) => Promise<{
      success: boolean;
      messageId?: string;
      error?: string;
      code?: string;
      shouldRemoveToken?: boolean;
    }>;
  }
}