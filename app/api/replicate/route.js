export async function POST(request) {
  const body = await request.json();
  const REPLICATE_KEY = process.env.REPLICATE_KEY;

  if (body.action === "create") {
    const res = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${REPLICATE_KEY}`,
      },
      body: JSON.stringify({
        input: {
          prompt: body.prompt,
          go_fast: true,
          num_outputs: 1,
          aspect_ratio: "1:1",
          output_format: "jpg",
          output_quality: 95,
        }
      }),
    });
    const data = await res.json();
    return Response.json(data);
  }

  if (body.action === "poll") {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${body.id}`, {
      headers: { "Authorization": `Bearer ${REPLICATE_KEY}` },
    });
    const data = await res.json();
    return Response.json(data);
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
