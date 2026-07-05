function createCircleTexture(type) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);

  if (type === "glow") {
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.2, "rgba(255,255,255,0.74)");
    gradient.addColorStop(0.52, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    gradient.addColorStop(0, "rgba(255,255,255,0.72)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

let scene;
let camera;
let renderer;
let controls;
let raycaster;
let mouse;
let galaxyGroup;
let poemPoints;
let dustPoints;
let sunPoints;
let themePoints;
let labelSprites = [];
let sourceCenters = new Map();
let sourceColors = new Map();
let sourceCounts = new Map();
let targetCameraPosition = null;
let targetControlsTarget = null;

const sourcePalette = [
  0xf2d68a,
  0x88ccff,
  0xaa88ff,
  0xaaffcc,
  0xff9fbd,
  0xffd27d,
  0x8ff0ff,
  0xc6b5ff,
  0xd8ff9b,
  0xffffff
];

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.z = 86;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.getElementById("canvas-container").appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;

  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 2.8;
  mouse = new THREE.Vector2();

  if (!window.poemData || window.poemData.length === 0) {
    console.error("Poem data not loaded.");
    return;
  }

  createAmbientStars();
  createGrandNebula(window.poemData);
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("click", onMouseClick);
  animate();
}

function createGrandNebula(poems) {
  galaxyGroup = new THREE.Group();
  scene.add(galaxyGroup);

  const sources = [...new Set(poems.map((poem) => poem.author || "未署名古籍"))];
  sourceCenters = new Map();
  sourceColors = new Map();
  sourceCounts = new Map();

  sources.forEach((source, index) => {
    const ring = index < 8 ? 58 : 96;
    const offset = index < 8 ? 0 : 8;
    const count = index < 8 ? Math.min(8, sources.length) : Math.max(1, sources.length - 8);
    const angle = ((index - offset) / count) * Math.PI * 2 + (index < 8 ? 0 : Math.PI / 8);
    const y = index % 2 === 0 ? 12 : -12;
    const center = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring * 0.82);
    sourceCenters.set(source, center);
    sourceColors.set(source, new THREE.Color(sourcePalette[index % sourcePalette.length]));
  });

  const poemGeom = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const themeStats = new Map();

  poems.forEach((poem, index) => {
    const source = poem.author || "未署名古籍";
    const center = sourceCenters.get(source);
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    const theme = getTheme(poem);
    const statKey = `${source}||${theme}`;
    themeStats.set(statKey, (themeStats.get(statKey) || 0) + 1);

    const radius = Math.random() * 20 + 5 + Math.sqrt(index % 37);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.push(
      center.x + radius * Math.sin(phi) * Math.cos(theta),
      center.y + radius * Math.sin(phi) * Math.sin(theta) * 0.72,
      center.z + radius * Math.cos(phi)
    );
    const color = sourceColors.get(source).clone().lerp(new THREE.Color(0xffffff), index < 16 ? 0.38 : 0.08 + Math.random() * 0.18);
    colors.push(color.r, color.g, color.b);
  });

  poemGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  poemGeom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  poemPoints = new THREE.Points(
    poemGeom,
    new THREE.PointsMaterial({
      size: 0.48,
      map: createCircleTexture("glow"),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    })
  );
  poemPoints.userData.items = poems;
  galaxyGroup.add(poemPoints);

  const sunGeom = new THREE.BufferGeometry();
  const sunPositions = [];
  const sunColors = [];
  const sunItems = [];

  sources.forEach((source, index) => {
    const center = sourceCenters.get(source);
    sunPositions.push(center.x, center.y, center.z);
    const color = sourceColors.get(source).clone().lerp(new THREE.Color(0xffffff), 0.22);
    sunColors.push(color.r, color.g, color.b);
    sunItems.push({
      title: `${source.replace(/[《》]/g, "")} · 主星`,
      author: source,
      content: `${sourceCounts.get(source)} 条古籍语料在此聚集。`,
      description: `这是“${source}”星系的太阳级节点。周围星尘均来自该古籍或由该古籍语气扩展生成；越靠近主星，语义越集中。`
    });
    const label = createTextSprite(source.replace(/[《》]/g, ""));
    label.position.set(center.x, center.y + 8, center.z);
    labelSprites.push(label);
    galaxyGroup.add(label);
  });

  sunGeom.setAttribute("position", new THREE.Float32BufferAttribute(sunPositions, 3));
  sunGeom.setAttribute("color", new THREE.Float32BufferAttribute(sunColors, 3));
  sunPoints = new THREE.Points(
    sunGeom,
    new THREE.PointsMaterial({
      size: 5.8,
      map: createCircleTexture("glow"),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    })
  );
  sunPoints.userData.items = sunItems;
  galaxyGroup.add(sunPoints);

  const enrichedThemes = [...themeStats.entries()]
    .map(([key, count]) => {
      const [source, theme] = key.split("||");
      return { source, theme, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 64);

  const themeGeom = new THREE.BufferGeometry();
  const themePositions = [];
  const themeColors = [];
  const themeItems = [];

  enrichedThemes.forEach((item, index) => {
    const center = sourceCenters.get(item.source);
    const angle = index * 2.399963;
    const radius = 12 + (index % 5) * 4;
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle * 1.7) * 5;
    const z = center.z + Math.sin(angle) * radius * 0.78;
    themePositions.push(x, y, z);
    const color = sourceColors.get(item.source).clone().lerp(new THREE.Color(0xffffff), 0.45);
    themeColors.push(color.r, color.g, color.b);
    themeItems.push({
      title: `${item.source.replace(/[《》]/g, "")} · ${item.theme}亮星`,
      author: item.source,
      content: `${item.theme}：显著富集 ${item.count} 次。`,
      description: `这是一个富集主题亮星，表示“${item.theme}”在${item.source}星系中高频出现。它不是普通星尘，而是语义密度更高的区域。`
    });
  });

  themeGeom.setAttribute("position", new THREE.Float32BufferAttribute(themePositions, 3));
  themeGeom.setAttribute("color", new THREE.Float32BufferAttribute(themeColors, 3));
  themePoints = new THREE.Points(
    themeGeom,
    new THREE.PointsMaterial({
      size: 2.0,
      map: createCircleTexture("glow"),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    })
  );
  themePoints.userData.items = themeItems;
  galaxyGroup.add(themePoints);
  hydrateInterface(poems, sources, sourceCounts, enrichedThemes);

  const dustGeom = new THREE.BufferGeometry();
  const dustPositions = [];
  const dustColors = [];
  const dustCount = window.innerWidth < 700 ? 14000 : 40000;
  const dustPalette = [new THREE.Color(0x112244), new THREE.Color(0x221144), new THREE.Color(0x071426), new THREE.Color(0x2b210d)];

  for (let index = 0; index < dustCount; index += 1) {
    const radius = Math.random() * 160;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPositions.push(
      radius * Math.sin(phi) * Math.cos(theta) * 2,
      radius * Math.sin(phi) * Math.sin(theta) * 0.78,
      radius * Math.cos(phi) * 1.5
    );
    const color = dustPalette[Math.floor(Math.random() * dustPalette.length)];
    dustColors.push(color.r, color.g, color.b);
  }

  dustGeom.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
  dustGeom.setAttribute("color", new THREE.Float32BufferAttribute(dustColors, 3));
  dustPoints = new THREE.Points(
    dustGeom,
    new THREE.PointsMaterial({
      size: 0.15,
      map: createCircleTexture("dust"),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      opacity: 0.58
    })
  );
  scene.add(dustPoints);
}

function createAmbientStars() {
  const container = document.getElementById("ambient-stars");
  if (!container || container.childElementCount > 0) return;

  for (let index = 0; index < 80; index += 1) {
    const star = document.createElement("span");
    star.className = "star";
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.animationDelay = `${Math.random() * 7}s`;
    star.style.animationDuration = `${5 + Math.random() * 7}s`;
    star.style.opacity = `${0.08 + Math.random() * 0.44}`;
    container.appendChild(star);
  }
}

function hydrateInterface(poems, sources, counts, enrichedThemes) {
  const sourceStat = document.getElementById("stat-sources");
  const passageStat = document.getElementById("stat-passages");
  const themeStat = document.getElementById("stat-themes");
  if (sourceStat) sourceStat.innerText = String(sources.length);
  if (passageStat) passageStat.innerText = poems.length.toLocaleString("zh-CN");
  if (themeStat) themeStat.innerText = String(enrichedThemes.length);

  const list = document.getElementById("source-list");
  if (!list) return;
  list.innerHTML = "";

  const allButton = createSourceButton("全域星云", poems.length, "#d7bd72");
  allButton.classList.add("active");
  allButton.addEventListener("click", () => {
    setActiveSource(allButton);
    focusSource("");
  });
  list.appendChild(allButton);

  sources.forEach((source) => {
    const color = sourceColors.get(source) || new THREE.Color(0xffffff);
    const button = createSourceButton(source.replace(/[《》]/g, ""), counts.get(source) || 0, `#${color.getHexString()}`);
    button.addEventListener("click", () => {
      setActiveSource(button);
      focusSource(source);
    });
    list.appendChild(button);
  });
}

function createSourceButton(name, count, color) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "source-chip";
  button.style.setProperty("--source-color", color);
  button.innerHTML = `
    <span class="source-dot"></span>
    <span class="source-name">${name}</span>
    <span class="source-count">${count.toLocaleString("zh-CN")}</span>
  `;
  return button;
}

function setActiveSource(activeButton) {
  document.querySelectorAll(".source-chip").forEach((button) => {
    button.classList.toggle("active", button === activeButton);
  });
}

function focusSource(source) {
  if (!source || !sourceCenters.has(source)) {
    targetControlsTarget = new THREE.Vector3(0, 0, 0);
    targetCameraPosition = new THREE.Vector3(0, 4, 118);
    return;
  }

  const center = sourceCenters.get(source).clone();
  targetControlsTarget = center;
  targetCameraPosition = center.clone().add(new THREE.Vector3(0, 12, 52));
}

function getTheme(poem) {
  const titleMatch = poem.title.match(/·\s*([^·\s]+?)星云/);
  if (titleMatch) return titleMatch[1];
  const knownThemes = ["阴阳", "经脉", "脾胃", "痰饮", "水气", "上药", "温邪", "胃阴", "少阳", "太阳", "大医"];
  return knownThemes.find((theme) => poem.title.includes(theme) || poem.content.includes(theme) || poem.description.includes(theme)) || "古籍";
}

function createTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "42px 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,255,255,0.65)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.78 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(26, 6.5, 1);
  return sprite;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseClick(event) {
  if (!document.getElementById("poem-modal").classList.contains("hidden")) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([sunPoints, themePoints, poemPoints].filter(Boolean), false);

  if (intersects.length > 0) {
    const hit = intersects[0];
    const item = hit.object.userData.items?.[hit.index];
    if (item) showPoemItem(item);
  }
}

function showPoem(index) {
  const poem = window.poemData[index];
  if (!poem) return;
  showPoemItem(poem);
}

function showPoemItem(poem) {
  const modal = document.getElementById("poem-modal");
  modal.classList.add("hidden");
  document.getElementById("poem-title").innerText = poem.title;
  document.getElementById("poem-author").innerText = `—— ${poem.author}`;
  document.getElementById("poem-body").innerText = poem.content;
  document.getElementById("poem-extra").innerText = poem.description || "暂无扩展说明。";

  window.setTimeout(() => {
    document.getElementById("poem-expand-btn").innerText = "展开详细内容";
    document.getElementById("poem-expand-btn").setAttribute("aria-expanded", "false");
    document.getElementById("poem-extra").classList.add("hidden");
    modal.classList.remove("hidden");
  }, 10);
}

window.__showClassicPoem__ = showPoem;

document.getElementById("close-btn").onclick = () => {
  document.getElementById("poem-modal").classList.add("hidden");
};

function closeModal() {
  document.getElementById("poem-modal").classList.add("hidden");
}

document.getElementById("back-btn").onclick = closeModal;
document.getElementById("poem-expand-btn").addEventListener(
  "click",
  (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const extra = document.getElementById("poem-extra");
    const expandBtn = document.getElementById("poem-expand-btn");
    const willExpand = extra.classList.contains("hidden");
    extra.classList.toggle("hidden", !willExpand);
    expandBtn.innerText = willExpand ? "收起详细内容" : "展开详细内容";
    expandBtn.setAttribute("aria-expanded", String(willExpand));
  },
  true
);
document.getElementById("poem-modal").addEventListener("click", (event) => {
  if (event.target.id === "poem-modal") closeModal();
});
document.querySelector(".modal-content").addEventListener("click", (event) => {
  event.stopPropagation();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

function animate() {
  requestAnimationFrame(animate);
  if (galaxyGroup) {
    galaxyGroup.rotation.y += 0.00034;
    galaxyGroup.rotation.x += 0.00014;
  }
  if (dustPoints) {
    dustPoints.rotation.y -= 0.00016;
    dustPoints.rotation.x -= 0.00008;
  }
  if (targetCameraPosition) {
    camera.position.lerp(targetCameraPosition, 0.045);
    if (camera.position.distanceTo(targetCameraPosition) < 0.08) targetCameraPosition = null;
  }
  if (targetControlsTarget && controls) {
    controls.target.lerp(targetControlsTarget, 0.06);
    if (controls.target.distanceTo(targetControlsTarget) < 0.08) targetControlsTarget = null;
  }
  controls?.update();
  renderer.render(scene, camera);
}

window.onload = init;
