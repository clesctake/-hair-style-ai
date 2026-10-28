/* Real CPU inference in a classic worker. Assets are same-origin; no customer photo upload. */
let vision, hair, face;
async function loadTasks() {
  // CPU delegates also transport input images through a GPU buffer.
  const probe=new OffscreenCanvas(1,1),context=probe.getContext('webgl2');
  if(!context)throw new Error('WEBGL2_UNAVAILABLE');
  context.getExtension('WEBGL_lose_context')?.loseContext();
  vision ??= await import('./vision_bundle.mjs');
  const files = await vision.FilesetResolver.forVisionTasks(new URL('./wasm', self.location.href).href);
  const errors = [];
  if (!hair) try { hair = await vision.ImageSegmenter.createFromOptions(files, { canvas: new OffscreenCanvas(1,1), baseOptions: { modelAssetPath: new URL('./models/hair_segmenter.tflite', self.location.href).href, delegate: 'CPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false }); } catch(e) { errors.push('HAIR_PROVIDER: ' + e.message); }
  if (!face) try { face = await vision.FaceLandmarker.createFromOptions(files, { canvas: new OffscreenCanvas(1,1), baseOptions: { modelAssetPath: new URL('./models/face_landmarker.task', self.location.href).href, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 2, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false }); } catch(e) { errors.push('FACE_PROVIDER: ' + e.message); }
  return errors;
}
self.onmessage = async ({ data }) => {
  if(data.type !== 'ANALYZE') return;
  const { id, width, height, pixels, detectFace } = data;
  try {
    const errors = await loadTasks();
    const canvas = new OffscreenCanvas(width, height); canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    let hairConfidence=null, maskWidth=null, maskHeight=null, faces=[];
    if(hair) try { const result=hair.segment(canvas); const labels=hair.getLabels(); const hairIndex=labels.findIndex(s=>s.toLowerCase()==='hair'); if(hairIndex<0)throw new Error('Hair label is absent');
      const mask=result.confidenceMasks?.[hairIndex]; if(!mask)throw new Error('Hair confidence mask is absent'); hairConfidence=new Float32Array(mask.getAsFloat32Array());maskWidth=mask.width;maskHeight=mask.height;result.close();
    } catch(e){errors.push('HAIR_INFERENCE: '+e.message);}
    if(detectFace&&face) try { faces=face.detect(canvas).faceLandmarks.map(points=>points.map(p=>({x:p.x,y:p.y,z:Number.isFinite(p.z)?p.z:null}))); }catch(e){errors.push('FACE_INFERENCE: '+e.message);}
    self.postMessage({id,hairConfidence,maskWidth,maskHeight,faces,errors},hairConfidence?[hairConfidence.buffer]:[]);
  }catch(e){self.postMessage({id,error:e.message});}
};
