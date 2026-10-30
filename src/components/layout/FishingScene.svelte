<!-- Generated location art is the only landscape layer; the canvas above it adds only water motion and fishing gear. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { themeOfHour } from "../../game/timeOfDay";
  import type { FishingSpotId } from "../../game/core/fishing";

  let {
    phase = "waiting",
    hour = 12,
    weather = "sunny",
    spotId = "treasure_lake",
    backgroundUrl = "",
  } = $props<{
    phase?: "waiting" | "bite" | "fighting" | "ready";
    hour?: number;
    weather?: string;
    spotId?: FishingSpotId;
    backgroundUrl?: string;
  }>();

  let canvas: HTMLCanvasElement;
  let activeBackground: HTMLImageElement | null = null;
  let activeBackgroundUrl = "";
  let activeBackgroundSpot: FishingSpotId | null = null;
  let loadGeneration = 0;
  let sceneKey = "";

  // Keep same-location art while another time/weather image decodes. When the
  // location changes, the neutral water fallback stays visible until its art is ready.
  $effect(() => {
    const url = backgroundUrl;
    const requestedSpot = spotId;
    const generation = ++loadGeneration;
    let cancelled = false;
    if (!url) return () => { cancelled = true; };

    const image = new Image();
    const commit = () => {
      if (cancelled || generation !== loadGeneration || image.naturalWidth === 0 || image.naturalHeight === 0) return;
      activeBackground = image;
      activeBackgroundUrl = url;
      activeBackgroundSpot = requestedSpot;
      sceneKey = "";
    };
    image.onload = () => {
      void (async () => {
        try { await image.decode?.(); } catch { /* natural dimensions are enough after onload */ }
        commit();
      })();
    };
    image.onerror = () => {
      // Preserve valid same-location art or draw the neutral water fallback.
    };
    image.src = url;
    if (image.complete && image.naturalWidth > 0) image.onload?.(new Event("load"));

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  });

  onMount(() => {
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context as CanvasRenderingContext2D;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    const noise = (n: number) => {
      const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    };

    function drawCover(image: HTMLImageElement, width: number, height: number) {
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    }

    function drawFallback(width: number, height: number, night: boolean, wet: boolean) {
      const horizon = height * 0.405;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, night ? "#142d43" : wet ? "#708386" : "#7da3ae");
      sky.addColorStop(1, night ? "#6d8786" : wet ? "#bac4bc" : "#d7d6bd");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, horizon);
      const water = ctx.createLinearGradient(0, horizon, 0, height);
      water.addColorStop(0, night ? "#446c72" : wet ? "#5a7978" : "#648d87");
      water.addColorStop(0.42, night ? "#244e5b" : "#346b70");
      water.addColorStop(1, night ? "#142d3a" : "#183f4b");
      ctx.fillStyle = water;
      ctx.fillRect(0, horizon, width, height - horizon);
      const haze = ctx.createLinearGradient(0, horizon - 12, 0, horizon + height * 0.1);
      haze.addColorStop(0, "#d8e0d000");
      haze.addColorStop(0.45, night ? "#c8d9cd18" : "#eee6ce35");
      haze.addColorStop(1, "#d8e0d000");
      ctx.fillStyle = haze;
      ctx.fillRect(0, horizon - 12, width, height * 0.1);
    }

    function drawScene() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 3);
      const worldWidth = 1200;
      const worldHeight = worldWidth * height / width;
      const key = [width, height, dpr, hour, weather, phase, spotId, backgroundUrl, activeBackgroundUrl].join(":");
      if (key !== sceneKey) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        sceneKey = key;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(canvas.width / worldWidth, 0, 0, canvas.height / worldHeight, 0, 0);

      const night = themeOfHour(hour) === "night";
      const wet = weather === "rain" || weather === "snow" || weather === "storm";
      if (activeBackground && activeBackgroundSpot === spotId) drawCover(activeBackground, worldWidth, worldHeight);
      else drawFallback(worldWidth, worldHeight, night, wet);

      // Only a restrained grade sits above the generated art; no duplicate sky, sun, hills, or trees.
      if (weather === "cloudy" || weather === "coldwave") {
        ctx.fillStyle = "#556c7122";
        ctx.fillRect(0, 0, worldWidth, worldHeight);
      } else if (wet) {
        ctx.fillStyle = "#253f4a2b";
        ctx.fillRect(0, 0, worldWidth, worldHeight);
      } else if (night) {
        ctx.fillStyle = "#071b3428";
        ctx.fillRect(0, 0, worldWidth, worldHeight);
      }

      const horizon = worldHeight * 0.405;
      // Low-contrast moving ripples sit on the water in both locations.
      for (let i = 0; i < 160; i++) {
        const depth = noise(i + 400);
        const y = horizon + (worldHeight - horizon) * depth * depth;
        const x = ((noise(i + 50) * worldWidth + elapsed * (1.4 + depth * 4) * (i % 2 ? 1 : -1)) % worldWidth + worldWidth) % worldWidth;
        const length = 3 + depth * depth * (14 + noise(i + 200) * 42);
        const alpha = 0.018 + noise(i + 70) * 0.042;
        ctx.strokeStyle = night
          ? "rgba(190,216,218," + alpha + ")"
          : "rgba(220,235,218," + alpha + ")";
        ctx.lineWidth = 0.5 + depth * 0.55;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + length * 0.5, y + Math.sin(elapsed * 0.55 + i) * 0.7, x + length, y);
        ctx.stroke();
      }

      // First-person fishing rod, line, float, and bite signal stay outside the image.
      const casted = ["waiting", "bite", "fighting"].includes(phase);
      const rodBaseX = worldWidth * 0.88;
      const rodBaseY = worldHeight * 1.06;
      let tipX = worldWidth * 0.62;
      let tipY = worldHeight * 0.54 + Math.sin(elapsed * 0.8) * 2;
      const bobX = worldWidth * 0.495 + Math.sin(elapsed * 1.3) * 2;
      const bobY = worldHeight * 0.61 + Math.sin(elapsed * 2) * 1.6;
      if (!casted) { tipX = worldWidth * 0.72; tipY = worldHeight * 0.67; }

      ctx.lineCap = "round";
      ctx.strokeStyle = "#061c2690";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(rodBaseX + 4, rodBaseY);
      ctx.quadraticCurveTo(worldWidth * 0.78, worldHeight * 0.72, tipX + 2, tipY + 3);
      ctx.stroke();
      const rod = ctx.createLinearGradient(tipX, tipY, rodBaseX, rodBaseY);
      rod.addColorStop(0, "#879c91");
      rod.addColorStop(0.55, "#334b4b");
      rod.addColorStop(0.85, "#1c323b");
      rod.addColorStop(1, "#b69b66");
      ctx.strokeStyle = rod;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(rodBaseX, rodBaseY);
      ctx.quadraticCurveTo(worldWidth * 0.78, worldHeight * 0.72, tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = "#d5e0cd9c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rodBaseX - 2, rodBaseY);
      ctx.quadraticCurveTo(worldWidth * 0.78 - 2, worldHeight * 0.72, tipX, tipY);
      ctx.stroke();
      for (let i = 1; i <= 4; i++) {
        const q = i / 5;
        const px = (1 - q) * (1 - q) * rodBaseX + 2 * (1 - q) * q * worldWidth * 0.78 + q * q * tipX;
        const py = (1 - q) * (1 - q) * rodBaseY + 2 * (1 - q) * q * worldHeight * 0.72 + q * q * tipY;
        ctx.strokeStyle = "#c6d3c2b0";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(px - 3, py, 4, 2.4, -0.9, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (casted) {
        const floatY = bobY + (phase === "bite" ? Math.sin(elapsed * 15) * 4 : 0);
        ctx.strokeStyle = "#f2f4e18c";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.quadraticCurveTo(worldWidth * 0.56, worldHeight * 0.57, bobX, floatY - 9);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const q = (elapsed * 0.5 + i / 3) % 1;
          ctx.strokeStyle = "rgba(218,234,213," + ((1 - q) * 0.24) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(bobX, floatY + 3, 8 + q * 30, (8 + q * 30) * 0.24, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = "#f1e4c0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bobX, floatY - 18);
        ctx.lineTo(bobX, floatY);
        ctx.stroke();
        ctx.fillStyle = "#df7555";
        ctx.beginPath();
        ctx.ellipse(bobX, floatY - 5, 3, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f1e5c8";
        ctx.beginPath();
        ctx.arc(bobX, floatY - 10, 3, 0, Math.PI * 2);
        ctx.fill();
        if (phase === "bite") {
          ctx.font = "bold 30px Georgia";
          ctx.fillStyle = "#ffe6a6";
          ctx.textAlign = "center";
          ctx.shadowBlur = 16;
          ctx.shadowColor = "#ffe6a6";
          ctx.fillText("!", bobX, floatY - 35);
          ctx.shadowBlur = 0;
        }
      }

      if (night) {
        for (let i = 0; i < 18; i++) {
          const x = noise(i + 480) * worldWidth;
          const y = worldHeight * (0.52 + noise(i + 510) * 0.36);
          const alpha = (Math.sin(elapsed * 1.25 + i) + 1) * 0.11;
          ctx.shadowBlur = 9;
          ctx.shadowColor = "#dceaad";
          ctx.fillStyle = "rgba(220,234,173," + alpha + ")";
          ctx.beginPath();
          ctx.arc(x + Math.sin(elapsed * 0.45 + i) * 8, y + Math.cos(elapsed * 0.6 + i) * 6, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      const vignette = ctx.createRadialGradient(worldWidth * 0.5, worldHeight * 0.45, worldHeight * 0.18, worldWidth * 0.5, worldHeight * 0.5, Math.max(worldWidth, worldHeight) * 0.72);
      vignette.addColorStop(0, "#031d2800");
      vignette.addColorStop(1, "#03172266");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, worldWidth, worldHeight);
    }

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    function animate(now: number) {
      if (!document.hidden) {
        elapsed += reduced.matches ? 0 : Math.min((now - last) / 1000 || 0, 0.04);
        drawScene();
      }
      last = now;
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>
<style>canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style>

