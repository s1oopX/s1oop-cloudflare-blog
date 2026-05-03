const maxImageBytes = 1024 * 1024;
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const imageProblems = (files) => files.flatMap((file) => {
  const problems = [];
  if (!supportedImageTypes.has(file.type)) problems.push(`${file.name} 格式不支持`);
  if (file.type === 'image/gif' && file.size > maxImageBytes) problems.push(`${file.name} 超过 1 MB`);
  return problems;
});

export const uploadedImageProblems = (files) => files.flatMap((file) => {
  const problems = [];
  if (!supportedImageTypes.has(file.type)) problems.push(`${file.name} 格式不支持`);
  if (file.size > maxImageBytes) problems.push(`${file.name} 超过 1 MB`);
  return problems;
});

export const readImageDimensions = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve({ width: image.naturalWidth, height: image.naturalHeight });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    resolve(null);
  };
  image.src = url;
});

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
  canvas.toBlob((blob) => resolve(blob), type, quality);
});

const compressImageFile = async (file) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { file, compressed: false, originalSize: file.size };
  }

  if (!window.createImageBitmap) {
    return { file, compressed: false, originalSize: file.size };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1600 / Math.max(1, longestSide));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { file, compressed: false, originalSize: file.size };
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, 'image/webp', 0.78);
    if (!blob || blob.size >= file.size) {
      return { file, compressed: false, originalSize: file.size };
    }

    return {
      file: new File([blob], file.name || 'image', { type: 'image/webp', lastModified: file.lastModified }),
      compressed: true,
      originalSize: file.size,
    };
  } catch {
    return { file, compressed: false, originalSize: file.size };
  }
};

export const prepareUploadForm = async (uploadForm, imageInput) => {
  const form = new FormData(uploadForm);
  const images = Array.from(imageInput?.files || []);
  const processed = await Promise.all(images.map(compressImageFile));
  form.delete('images');
  processed.forEach(({ file }) => {
    if (file.size > 0) form.append('images', file);
  });
  return { form, processed };
};
