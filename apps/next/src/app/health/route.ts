export function GET() {
  return Response.json({
    status: "ok",
    version: process.env.APP_VERSION ?? "unknown",
  });
}