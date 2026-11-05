import * as THREE from "three";

function createSignTexture(title: string): THREE.CanvasTexture {
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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function signMaterial(title: string): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: createSignTexture(title),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.userData.outlineParameters = { visible: false };
  return material;
}
