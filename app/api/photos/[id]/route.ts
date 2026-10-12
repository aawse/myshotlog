import { journal } from "@/lib/data";
import { AuthenticationRequired } from "@/lib/auth/server";
import { RecordNotFound } from "@/lib/git-database/store";
import { photoIdSchema } from "@/lib/photos/schema";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const store = await journal();
    const { id } = await params;
    if (!photoIdSchema.safeParse(id).success)
      return new Response(null, { status: 404 });
    const photo = await store.photo(id);
    return new Response(new Uint8Array(Buffer.from(photo.data, "base64")), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status =
      error instanceof AuthenticationRequired ||
      (error instanceof Error && error.message === "AUTH_REQUIRED")
        ? 401
        : error instanceof RecordNotFound
          ? 404
          : 503;
    return new Response(null, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
