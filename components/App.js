"use client";
import { useState, useRef, useCallback } from "react";

const SCENES = [
  { id: "nordic", label: "北歐極簡", emoji: "🪵", desc: "原木桌面、白牆、自然光" },
  { id: "japandi", label: "日系侘寂", emoji: "🍵", desc: "竹簾、麻布、陶器搭配" },
  { id: "modern", label: "現代輕奢", emoji: "✨", desc: "大理石、金屬光澤、柔光" },
  { id: "outdoor", label: "戶外自然", emoji: "🌿", desc: "窗台陽光、植物圍繞" },
  { id: "cafe", label: "咖啡廳風", emoji: "☕", desc: "木質桌面、暖燈、書本" },
];

const STEP = { IDLE: "idle", ANALYZING: "analyzing", REMOVING: "removing", GENERATING: "generating", DONE: "done", ERROR: "error" };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function App() {
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMediaType, setImageMediaType] = useState("image/jpeg");
  const [selectedScene, setSelectedScene] = useState(null);
  const [step, setStep] = useState(STEP.IDLE);
  const [analysis, setAnalysis] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [layoutImage, setLayoutImage] = useState(null);
  const [layoutBase64, setLayoutBase64] = useState(null);
  const [layoutMediaType, setLayoutMediaType] = useState("image/jpeg");
  const [removeBgEnabled, setRemoveBgEnabled] = useState(true);
  const [useNanaBanana, setUseNanaBanana] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const fileRef = useRef();
  const layoutRef = useRef();

  const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_KEY;
  const REMOVEBG_KEY = process.env.NEXT_PUBLIC_REMOVEBG_KEY;
  const GEMINI_IMAGE_KEY = process.env.NEXT_PUBLIC_GEMINI_KEY;

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImage(URL.createObjectURL(file));
    setAnalysis(null);
    setGeneratedImage(null);
    setStep(STEP.IDLE);
    setDebugInfo("");
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageBase64(e.target.result.split(",")[1]);
      setImageMediaType(file.type || "image/jpeg");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleLayoutFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setLayoutImage(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onload = (e) => {
      setLayoutBase64(e.target.result.split(",")[1]);
      setLayoutMediaType(file.type || "image/jpeg");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const compressImage = (base64, mimeType) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 1024;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });

  const compositeProductOnBackground = (base64, mimeType) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const SIZE = 1024;
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(0, 0, SIZE, SIZE);
      const maxProductSize = SIZE * 0.20;
      const scale = Math.min(maxProductSize / img.width, maxProductSize / img.height);
      const pw = img.width * scale;
      const ph = img.height * scale;
      const px = (SIZE - pw) / 2;
      const py = SIZE * 0.15;
      ctx.drawImage(img, px, py, pw, ph);
      resolve(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });

  const removeBackground = async (base64, mimeType) => {
    const blob = await fetch(`data:${mimeType};base64,${base64}`).then(r => r.blob());
    const formData = new FormData();
    formData.append("image_file", blob, "product.jpg");
    formData.append("size", "auto");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": REMOVEBG_KEY },
      body: formData,
    });
    if (!res.ok) throw new Error(`去背失敗：${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  };

  const generateWithNanaBanana = async (imageBase64, mimeType, prompt, layoutB64, layoutMime) => {
    const parts = [];
    parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
    if (layoutB64) {
      parts.push({ inline_data: { mime_type: layoutMime || "image/jpeg", data: layoutB64 } });
      parts.push({ text: "The first image is the product. The second image is a composition layout reference — follow it strictly for product position and scale. Medium shot, clock clearly visible. The clock should be smaller than any potted plants in the scene. " + prompt + " Generate a photorealistic product scene image." });
    } else {
      parts.push({ text: "Medium shot, clock clearly visible. The clock should be smaller than any potted plants in the scene. " + prompt + " Generate a photorealistic product scene image." });
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_IMAGE_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
        })
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(`Nano Banana 錯誤：${data.error.message}`);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith("image/"));
    if (!imgPart) throw new Error("Nano Banana 沒有回傳圖片");
    return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
  };

  const run = async () => {
    if (!imageBase64) return;
    setStep(STEP.ANALYZING);
    setAnalysis(null);
    setGeneratedImage(null);
    setErrorMsg("");
    setDebugInfo("");

    try {
      const sceneNote = selectedScene
        ? `用戶指定場景：「${SCENES.find(s => s.id === selectedScene)?.label}」（${SCENES.find(s => s.id === selectedScene)?.desc}）。`
        : "請根據商品自動選擇最適合場景。";

      // Step 1: Gemini analyzes product
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: imageMediaType, data: imageBase64 } },
                {
                  text: `你是電商商品攝影師，專注居家類產品（時鐘、盆栽等）。
分析這個商品，只輸出純 JSON，不要任何說明文字或 markdown：
{
  "product_type": "商品類型",
  "is_wall_clock": "true或false，判斷是否為掛鐘",
  "matched_scene": "場景名稱（中文）",
  "scene_reason": "選擇原因（10字內）",
  "prompt": "Keep the product exactly as shown with its original colors, materials and surface texture unchanged. If it is a wall clock, it must be mounted and hanging on a wall in the background, sized realistically relative to the room — a 30cm clock should look small on a large wall, with furniture and room elements visible around it to show proper scale. The clock is a background decoration, not the main subject. Place it in [scene description]. Describe the full room with furniture, lighting, atmosphere. Do NOT alter the product appearance. At least 60 words. End with: professional interior photography, high quality, 8k, realistic proportions, wall clock as background element"
}
${sceneNote}`
                }
              ]
            }],
            generationConfig: { temperature: 0.2 }
          })
        }
      );

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const errorDetail = geminiData.error?.message || "";
      setDebugInfo(errorDetail || rawText.substring(0, 200));

      if (errorDetail) throw new Error(`Gemini 錯誤：${errorDetail}`);
      if (!rawText) throw new Error("Gemini 沒有回傳內容");

      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`無法解析回應：${rawText.substring(0, 100)}`);

      let parsed;
      try { parsed = JSON.parse(match[0]); }
      catch(e) { throw new Error(`JSON 解析失敗：${match[0].substring(0, 100)}`); }

      setAnalysis(parsed);

      // Step 2: Auto remove background (if enabled)
      let inputImage;
      const isWallClock = parsed.is_wall_clock === "true";
      if (removeBgEnabled) {
        setStep(STEP.REMOVING);
        const removedBg = await removeBackground(imageBase64, imageMediaType);
        inputImage = isWallClock
          ? await compositeProductOnBackground(removedBg, "image/png")
          : await compressImage(removedBg, "image/png");
      } else {
        inputImage = isWallClock
          ? await compositeProductOnBackground(imageBase64, imageMediaType)
          : await compressImage(imageBase64, imageMediaType);
      }

      // Step 4: Generate image
      setStep(STEP.GENERATING);
      let finalImgUrl;

      if (useNanaBanana) {
        // Use Gemini Nano Banana
        finalImgUrl = await generateWithNanaBanana(inputImage, "image/jpeg", parsed.prompt, layoutBase64, layoutMediaType);
      } else {
        // Use flux-kontext-max
        const replicateRes = await fetch("/api/replicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            input: {
              prompt: parsed.prompt,
              input_image: `data:image/jpeg;base64,${inputImage}`,
              aspect_ratio: "1:1",
              output_format: "jpg",
              output_quality: 100,
              safety_tolerance: 2,
            },
          }),
        });

        const prediction = await replicateRes.json();
        if (!prediction.id) throw new Error(prediction.detail || "無法建立生成任務");

        let result = prediction;
        let attempts = 0;
        while (result.status !== "succeeded" && result.status !== "failed" && attempts < 60) {
          await sleep(2000);
          const pollRes = await fetch("/api/replicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "poll", id: result.id }),
          });
          result = await pollRes.json();
          attempts++;
        }

        if (result.status === "succeeded") {
          finalImgUrl = Array.isArray(result.output) ? result.output[0] : result.output;
          if (!finalImgUrl) throw new Error(`成功但無圖片：${JSON.stringify(result.output)}`);
        } else {
          throw new Error(result.error || `狀態：${result.status}`);
        }
      }

      setGeneratedImage(finalImgUrl);
      setStep(STEP.DONE);
      // Auto download
      try {
        const isDataUrl = finalImgUrl.startsWith("data:");
        if (isDataUrl) {
          const a = document.createElement("a");
          a.href = finalImgUrl;
          a.download = `product-scene-${Date.now()}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          const res = await fetch(finalImgUrl);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `product-scene-${Date.now()}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch(e) { console.log("Auto download failed", e); }
    } catch (err) {
      setErrorMsg(err.message);
      setStep(STEP.ERROR);
    }
  };

  const reset = () => {
    setImage(null); setImageBase64(null); setAnalysis(null);
    setGeneratedImage(null); setStep(STEP.IDLE);
    setSelectedScene(null); setErrorMsg(""); setDebugInfo("");
  };

  const canRun = image && ![STEP.ANALYZING, STEP.REMOVING, STEP.GENERATING].includes(step);

  const statusText = {
    [STEP.ANALYZING]: "🔍 分析商品中...",
    [STEP.REMOVING]: "✂️ 自動去背中...",
    [STEP.GENERATING]: "🎨 生成圖片中...",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f4ef", fontFamily: "Georgia, serif", color: "#2c2a27" }}>
      <div style={{ background: "#2c2a27", color: "#f7f4ef", padding: "24px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 4, opacity: 0.4, marginBottom: 4, textTransform: "uppercase" }}>AI 電商工作流</div>
          <div style={{ fontSize: 20, letterSpacing: 1 }}>商品場景生成器</div>
        </div>
        <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: 1 }}>居家 · 時鐘 · 盆栽</div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.4, marginBottom: 10, textTransform: "uppercase" }}>01 — 上傳商品照片</div>
              <div
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{ border: `2px dashed ${dragOver ? "#8b7355" : "#c8bfb0"}`, borderRadius: 4, minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: dragOver ? "#ede8e0" : "#faf8f5", transition: "all 0.2s", overflow: "hidden" }}
              >
                {image
                  ? <img src={image} alt="product" style={{ width: "100%", height: 240, objectFit: "contain", padding: 12 }} />
                  : <div style={{ textAlign: "center", padding: 32 }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
                      <div style={{ fontSize: 12, opacity: 0.5, lineHeight: 1.8 }}>點擊或拖曳上傳<br /><span style={{ fontSize: 11 }}>JPG、PNG、WEBP</span></div>
                    </div>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>

            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.4, marginBottom: 10, textTransform: "uppercase" }}>02 — 構圖參考圖（可略，僅 Nano Banana）</div>
              <div
                onClick={() => layoutRef.current.click()}
                style={{ border: `1.5px dashed #c8bfb0`, borderRadius: 4, minHeight: 100, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#faf8f5", overflow: "hidden" }}
              >
                {layoutImage
                  ? <img src={layoutImage} alt="layout" style={{ width: "100%", height: 100, objectFit: "contain", padding: 8 }} />
                  : <div style={{ textAlign: "center", padding: 16 }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>📐</div>
                      <div style={{ fontSize: 11, opacity: 0.4, lineHeight: 1.6 }}>上傳構圖參考圖<br />決定時鐘位置和大小</div>
                    </div>
                }
              </div>
              <input ref={layoutRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleLayoutFile(e.target.files[0])} />
            </div>

            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.4, marginBottom: 10, textTransform: "uppercase" }}>03 — 場景風格（可略）</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SCENES.map(sc => (
                  <button key={sc.id} onClick={() => setSelectedScene(selectedScene === sc.id ? null : sc.id)} style={{ padding: "7px 13px", border: `1.5px solid ${selectedScene === sc.id ? "#8b7355" : "#c8bfb0"}`, borderRadius: 2, background: selectedScene === sc.id ? "#8b7355" : "transparent", color: selectedScene === sc.id ? "#fff" : "#2c2a27", fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}>
                    {sc.emoji} {sc.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#faf8f5", border: "1.5px solid #e8e0d5", borderRadius: 2 }}>
              <div
                onClick={() => setRemoveBgEnabled(v => !v)}
                style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: removeBgEnabled ? "#8b7355" : "#c8bfb0",
                  position: "relative", cursor: "pointer", transition: "all 0.2s",
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", background: "#fff",
                  position: "absolute", top: 2,
                  left: removeBgEnabled ? 18 : 2,
                  transition: "all 0.2s",
                }} />
              </div>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1 }}>✂️ 自動去背</div>
                <div style={{ fontSize: 10, opacity: 0.4 }}>{removeBgEnabled ? "開啟 — 需要 remove.bg 額度" : "關閉 — 直接使用原圖"}</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#faf8f5", border: "1.5px solid #e8e0d5", borderRadius: 2 }}>
              <div
                onClick={() => setUseNanaBanana(v => !v)}
                style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: useNanaBanana ? "#8b7355" : "#c8bfb0",
                  position: "relative", cursor: "pointer", transition: "all 0.2s",
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", background: "#fff",
                  position: "absolute", top: 2,
                  left: useNanaBanana ? 18 : 2,
                  transition: "all 0.2s",
                }} />
              </div>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1 }}>🍌 圖像模型</div>
                <div style={{ fontSize: 10, opacity: 0.4 }}>{useNanaBanana ? "Gemini Nano Banana（便宜）" : "flux-kontext-max（穩定）"}</div>
              </div>
            </div>

            <button onClick={run} disabled={!canRun} style={{ padding: "16px", border: "none", borderRadius: 2, background: !canRun ? "#c8bfb0" : "#2c2a27", color: "#f7f4ef", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", cursor: !canRun ? "not-allowed" : "pointer" }}>
              {statusText[step] || "✦ 開始生成商品圖"}
            </button>

            {step === STEP.DONE && (
              <button onClick={reset} style={{ padding: "14px", border: "1.5px solid #c8bfb0", borderRadius: 2, background: "transparent", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", color: "#2c2a27" }}>↺ 重新上傳</button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.4, textTransform: "uppercase" }}>04 — 生成結果</div>

            {step === STEP.IDLE && (
              <div style={{ background: "#faf8f5", border: "1.5px solid #e8e0d5", borderRadius: 4, minHeight: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#c8bfb0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏮</div>
                <div style={{ fontSize: 12, textAlign: "center", lineHeight: 1.8 }}>上傳商品照片後<br />AI 自動分析、去背、生成場景圖</div>
              </div>
            )}

            {[STEP.ANALYZING, STEP.REMOVING, STEP.GENERATING].includes(step) && (
              <div style={{ background: "#faf8f5", border: "1.5px solid #e8e0d5", borderRadius: 4, minHeight: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <div style={{ width: 36, height: 36, border: "2px solid #e8e0d5", borderTop: "2px solid #8b7355", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.5 }}>{statusText[step]}</div>
                {analysis && (
                  <div style={{ textAlign: "center", fontSize: 12, opacity: 0.6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{analysis.product_type}</div>
                    <div>{analysis.matched_scene} — {analysis.scene_reason}</div>
                  </div>
                )}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {step === STEP.DONE && generatedImage && (
              <>
                <div style={{ borderRadius: 4, overflow: "hidden", border: "1.5px solid #e8e0d5" }}>
                  <img src={generatedImage} alt="generated" style={{ width: "100%", display: "block" }} />
                </div>
                {analysis && (
                  <div style={{ background: "#faf8f5", border: "1.5px solid #e8e0d5", borderRadius: 4, padding: 20 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, opacity: 0.4, marginBottom: 8, textTransform: "uppercase" }}>AI 分析</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{analysis.product_type}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>場景：{analysis.matched_scene} — {analysis.scene_reason}</div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <a href={generatedImage} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", textDecoration: "none", display: "block", padding: "12px", background: "#8b7355", color: "#fff", borderRadius: 2, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>↓ 下載圖片</a>
                  <button onClick={reset} style={{ flex: 1, padding: "12px", border: "1.5px solid #c8bfb0", borderRadius: 2, background: "transparent", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", color: "#2c2a27" }}>↺ 重新上傳</button>
                </div>
              </>
            )}

            {step === STEP.ERROR && (
              <div style={{ background: "#fdf0f0", border: "1.5px solid #f0c0c0", borderRadius: 4, padding: 20 }}>
                <div style={{ fontSize: 13, color: "#c04040", marginBottom: 8 }}>生成失敗</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>{errorMsg}</div>
                {debugInfo && (
                  <div style={{ background: "#2c2a27", color: "#f0c0c0", borderRadius: 2, padding: "8px 10px", fontSize: 10, fontFamily: "monospace", lineHeight: 1.6, marginBottom: 12, wordBreak: "break-all" }}>{debugInfo}</div>
                )}
                <button onClick={run} style={{ padding: "10px 20px", background: "#c04040", color: "#fff", border: "none", borderRadius: 2, fontSize: 11, cursor: "pointer" }}>重試</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
