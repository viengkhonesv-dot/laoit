// Google Flow (https://flow.google.com/) ບໍ່ມີ public API, ສະນັ້ນເຮົາສົ່ງຕໍ່ດ້ວຍ "Flow package":
// prompt ພ້ອມໃຊ້ສຳລັບແຕ່ລະສະໄລ້/scene ທີ່ copy ໄປວາງໃນ Flow ໄດ້ທັນທີ ຫຼື ດາວໂຫຼດເປັນ JSON.
export const FLOW_URL = "https://flow.google.com/";

export function buildFlowPackage(content) {
  const isCarousel = content.type === "carousel";
  const items = (isCarousel ? content.data.slides : content.data.scenes) || [];
  const aspectRatio = isCarousel ? "4:5 (portrait) — ຖ້າ Flow ບໍ່ມີ 4:5 ໃຫ້ໃຊ້ 1:1 ຫຼື 3:4" : "9:16 (vertical)";
  const mode = isCarousel ? "Image generation" : "Text to Video (Veo)";

  const prompts = items.map((item) => ({
    number: item.number,
    label: isCarousel ? `Slide ${item.number} — ${item.headline}` : `Scene ${item.number} (${item.durationSeconds}s)`,
    prompt: item.flowPrompt,
    overlayText: isCarousel ? [item.headline, item.body].filter(Boolean).join("\n") : item.onScreenText,
    voiceover: isCarousel ? undefined : item.voiceover,
  }));

  const text = [
    `# ${content.data.title}`,
    `Flow mode: ${mode}`,
    `Aspect ratio: ${aspectRatio}`,
    "",
    ...prompts.flatMap((p) => [
      `## ${p.label}`,
      p.prompt,
      p.overlayText ? `\n[Lao text overlay — ເພີ່ມທີຫຼັງໃນ Canva/Figma/CapCut]\n${p.overlayText}` : "",
      p.voiceover ? `\n[Voiceover]\n${p.voiceover}` : "",
      "",
    ]),
  ].join("\n");

  return {
    flowUrl: FLOW_URL,
    mode,
    aspectRatio,
    title: content.data.title,
    prompts,
    text,
  };
}
