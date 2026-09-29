import { getQueue } from "@/lib/queue";
import { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const queue = getQueue();
  const initial = queue.get(id);
  if (!initial) {
    return new Response(JSON.stringify({ error: "Job not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const finishIfTerminal = (job: Job) => {
        if (job.status === "done" || job.status === "error") {
          cleanup();
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        }
      };
      const onUpdate = (job: Job) => {
        if (job.id !== id) return;
        send(job);
        finishIfTerminal(job);
      };
      queue.on("update", onUpdate);
      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(": hb\n\n"));
          } catch {
            closed = true;
          }
        }
      }, 15000);
      cleanup = () => {
        clearInterval(heartbeat);
        queue.off("update", onUpdate);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        closed = true;
      });
      send(initial);
      finishIfTerminal(initial);
    },
    cancel() {
      cleanup();
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
