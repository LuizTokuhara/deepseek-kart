import * as THREE from "three";

type SignTheme = "wood" | "tropical" | "ice" | "desert";

function createSignTexture(title: string, theme: SignTheme): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D não disponível para a placa da pista");
  }

  context.fillStyle = "#bd753e";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#9d5b32";
  for (const y of [72, 128, 184]) context.fillRect(0, y, canvas.width, 4);

  const square = 32;
  context.fillStyle = "#f7f4e8";
  for (let row = 0; row < 2; row++) {
    const y = row === 0 ? 0 : canvas.height - square;
    for (let column = 0; column < canvas.width / square; column++) {
      if ((column + row) % 2 === 0) {
        context.fillRect(column * square, y, square, square);
      }
    }
  }

  context.font = "900 140px Arial Black, Arial, Helvetica, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#754128";
  context.fillText(title, canvas.width / 2 + 7, 141, canvas.width - 110);
  context.strokeStyle = "#304a8d";
  context.lineWidth = 12;
  context.lineJoin = "round";
  context.strokeText(title, canvas.width / 2, 132, canvas.width - 110);
  context.fillStyle = "#89abff";
  context.fillText(title, canvas.width / 2, 132, canvas.width - 110);

  if (theme === "tropical") {
    context.fillStyle = "#20594f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#287367";
    for (let x = -100; x < canvas.width; x += 100) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x + 55, 0);
      context.lineTo(x + 155, 256); context.lineTo(x + 100, 256); context.fill();
    }
    context.fillStyle = "#f4cc75";
    context.fillRect(0, 8, canvas.width, 8);
    context.fillRect(0, 240, canvas.width, 8);
    context.font = "900 132px Arial Black, Arial, sans-serif";
    context.lineWidth = 10; context.strokeStyle = "#163e38";
    context.strokeText(title, canvas.width / 2, 115, canvas.width - 150);
    context.fillStyle = "#fff0cf";
    context.fillText(title, canvas.width / 2, 115, canvas.width - 150);
    context.font = "bold 36px Arial, sans-serif";
    context.fillStyle = "#f4cc75";
    context.fillText("T R O P I C A L   G R A N D   P R I X", canvas.width / 2, 204);
  } else if (theme === "ice") {
    context.fillStyle = "#3b7fa6";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#79bdd9";
    for (let x = -140; x < canvas.width; x += 190) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + 100, 0);
      context.lineTo(x + 235, 256);
      context.lineTo(x + 136, 256);
      context.fill();
    }
    context.fillStyle = "#f4fdff";
    context.fillRect(0, 8, canvas.width, 10);
    context.fillRect(0, 238, canvas.width, 10);
    context.font = "900 132px Arial Black, Arial, sans-serif";
    context.lineWidth = 10;
    context.strokeStyle = "#1b4d69";
    context.strokeText(title, canvas.width / 2, 115, canvas.width - 150);
    context.fillStyle = "#e8fbff";
    context.fillText(title, canvas.width / 2, 115, canvas.width - 150);
    context.font = "bold 36px Arial, sans-serif";
    context.fillStyle = "#bfeaff";
    context.fillText("F R O Z E N   G R A N D   P R I X", canvas.width / 2, 204);
  } else if (theme === "desert") {
    context.fillStyle = "#d3a45d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Aparelho de blocos e faixas de turquesa nas bordas.
    context.fillStyle = "#c3914e";
    for (let y = 64; y < canvas.height; y += 64) context.fillRect(0, y, canvas.width, 5);
    context.fillStyle = "#1d7477";
    context.fillRect(0, 0, canvas.width, 18);
    context.fillRect(0, canvas.height - 18, canvas.width, 18);
    context.fillStyle = "#f2d37e";
    context.fillRect(0, 18, canvas.width, 7);
    context.fillRect(0, canvas.height - 25, canvas.width, 7);
    // Pirâmides discretas nos cantos, sem competir com o texto.
    context.fillStyle = "#b9813f";
    for (const [x, size] of [[92, 86], [1444, 86], [238, 58], [1298, 58]] as const) {
      context.beginPath();
      context.moveTo(x - size, 208);
      context.lineTo(x, 208 - size);
      context.lineTo(x + size, 208);
      context.closePath();
      context.fill();
    }
    context.fillStyle = "#f8e6af";
    context.beginPath();
    context.arc(canvas.width / 2, 52, 24, 0, Math.PI * 2);
    context.fill();
    context.font = "900 132px Arial Black, Arial, sans-serif";
    context.lineWidth = 11;
    context.strokeStyle = "#4a2a16";
    context.strokeText(title, canvas.width / 2, 145, canvas.width - 170);
    context.fillStyle = "#fff0c2";
    context.fillText(title, canvas.width / 2, 145, canvas.width - 170);
    context.font = "bold 34px Arial, sans-serif";
    context.fillStyle = "#1d5e62";
    context.fillText("S U N S T O N E   G R A N D   P R I X", canvas.width / 2, 224);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function signMaterial(title: string, theme: SignTheme = "wood"): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: createSignTexture(title, theme),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.userData.outlineParameters = { visible: false };
  return material;
}
