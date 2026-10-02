export const cropFace = (video, box) => {
  const size = Math.min(
    Math.max(box.width, box.height) * 1.25,
    video.videoWidth,
    video.videoHeight
  );
  const centerX = box.originX + box.width / 2;
  const centerY = box.originY + box.height / 2;
  const sourceX = Math.max(0, Math.min(video.videoWidth - size, centerX - size / 2));
  const sourceY = Math.max(0, Math.min(video.videoHeight - size, centerY - size / 2));
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare a face image.");
  }

  context.drawImage(video, sourceX, sourceY, size, size, 0, 0, 224, 224);
  return canvas.toDataURL("image/jpeg", 0.76).split(",")[1];
};

export const trackDetections = (boxes, previousFaces, nextFaceId, width, height) => {
  const matchedIds = new Set();
  let nextId = nextFaceId;

  const faces = boxes.map((box) => {
    const centerX = (box.originX + box.width / 2) / width;
    const centerY = (box.originY + box.height / 2) / height;
    let match = null;
    let closestDistance = 0.16;

    for (const previous of previousFaces) {
      if (matchedIds.has(previous.id)) {
        continue;
      }

      const distance = Math.hypot(
        centerX - previous.centerX,
        centerY - previous.centerY
      );
      if (distance < closestDistance) {
        match = previous;
        closestDistance = distance;
      }
    }

    if (match) {
      matchedIds.add(match.id);
    }

    return {
      id: match?.id ?? nextId++,
      box,
      centerX,
      centerY,
      emotion: match?.emotion ?? null,
      confidence: match?.confidence ?? null,
    };
  });

  return { faces, nextFaceId: nextId };
};

export const mapVideoBoxToDisplay = (box, videoSize, displaySize, mirrored) => {
  const scale = Math.min(
    displaySize.width / videoSize.width,
    displaySize.height / videoSize.height
  );
  const renderedWidth = videoSize.width * scale;
  const renderedHeight = videoSize.height * scale;
  const offsetX = (displaySize.width - renderedWidth) / 2;
  const offsetY = (displaySize.height - renderedHeight) / 2;
  // Detection stays in raw video space; mirror only box geometry so badge text stays readable.
  const x = mirrored
    ? offsetX + (videoSize.width - box.originX - box.width) * scale
    : offsetX + box.originX * scale;

  return {
    x,
    y: offsetY + box.originY * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
};

export const getCameraSwitchPosition = (faces = [], videoSize, displaySize, mirrored) => {
  if (!displaySize.width || !displaySize.height) {
    return "bottom-right";
  }

  const size = 48;
  const edge = 12;
  const candidates = [
    { name: "bottom-right", x: displaySize.width - size - edge, y: displaySize.height - size - edge },
    { name: "bottom-left", x: edge, y: displaySize.height - size - edge },
    { name: "top-right", x: displaySize.width - size - edge, y: 50 },
    { name: "top-left", x: edge, y: 50 },
  ];
  const faceRegions = faces.flatMap((face) => {
    const box = mapVideoBoxToDisplay(face.box, videoSize, displaySize, mirrored);
    const emotion = face.emotion
      ? `${face.emotion} ${Math.round((face.confidence ?? 0) * 100)}%`
      : "Analyzing";
    const badgeWidth = Math.min(
      displaySize.width - 8,
      Math.max(110, (`Face ${face.id} | ${emotion}`).length * 7 + 36)
    );
    const badgeX = Math.max(4, Math.min(displaySize.width - badgeWidth - 4, box.x));
    const badgeY = Math.max(4, box.y - 30);

    return [
      { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
      { x: badgeX - 4, y: badgeY - 4, width: badgeWidth + 8, height: 32 },
    ];
  });
  const score = (candidate) => faceRegions.reduce((total, region) => {
    const overlapWidth = Math.max(
      0,
      Math.min(candidate.x + size, region.x + region.width) - Math.max(candidate.x, region.x)
    );
    const overlapHeight = Math.max(
      0,
      Math.min(candidate.y + size, region.y + region.height) - Math.max(candidate.y, region.y)
    );
    return total + overlapWidth * overlapHeight;
  }, 0);

  return candidates.reduce((best, candidate) =>
    score(candidate) < score(best) ? candidate : best
  ).name;
};

export const drawFaceBoxes = (canvas, video, faces, mirrored) => {
  if (!canvas || !video.videoWidth || !video.videoHeight) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  const scale = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = Math.max(1.5, scale * 1.5);
  context.font = `600 ${12 * scale}px system-ui, sans-serif`;
  context.textBaseline = "middle";

  faces.forEach((face) => {
    const box = mapVideoBoxToDisplay(
      face.box,
      { width: video.videoWidth, height: video.videoHeight },
      { width: canvas.width, height: canvas.height },
      mirrored
    );
    const result = face.emotion
      ? `${face.emotion} ${Math.round((face.confidence ?? 0) * 100)}%`
      : "Analyzing";
    const label = `Face ${face.id} | ${result}`;
    const badgeHeight = 24 * scale;
    const markerSpace = 13 * scale;
    const badgeWidth = context.measureText(label).width + markerSpace + 16 * scale;
    const badgeX = Math.max(
      4 * scale,
      Math.min(canvas.width - badgeWidth - 4 * scale, box.x)
    );
    const badgeY = Math.max(4 * scale, box.y - badgeHeight - 4 * scale);

    context.strokeStyle = "#a8d2b6";
    context.strokeRect(box.x, box.y, box.width, box.height);
    context.fillStyle = "rgba(10, 15, 13, 0.94)";
    context.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    context.strokeStyle = "rgba(168, 210, 182, 0.72)";
    context.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
    context.beginPath();
    context.arc(badgeX + 8 * scale, badgeY + badgeHeight / 2, 2.5 * scale, 0, Math.PI * 2);
    context.fillStyle = "#a8d2b6";
    context.fill();
    context.fillStyle = "#f0f4f1";
    context.fillText(label, badgeX + markerSpace, badgeY + badgeHeight / 2);
  });
};

export const clearFaceOverlay = (canvas) => {
  if (canvas) {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }
};