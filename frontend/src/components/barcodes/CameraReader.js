import React, { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { createBarcodeReader } from '../../utils/barcodeReader';
import { translate, useAppLanguage } from '../../context/LanguageContext';

// iOS supports one capture session. Serialize permission prompts so reopening
// a sheet cannot let an older, late permission result replace the new camera.
let cameraRequest = Promise.resolve();
const acquireCamera = () => {
  cameraRequest = cameraRequest.catch(() => {}).then(() => navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false,
  }));
  return cameraRequest;
};

export default function CameraReader({ open, onClose, onRead }) {
  useAppLanguage();
  const [videoElement, setVideoElement] = useState(null);
  const callback = useRef(onRead);
  callback.current = onRead;
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [needsPlay, setNeedsPlay] = useState(false);
  const resume = useRef(null);
  useEffect(() => {
    if (open) { setError(''); setReady(false); setNeedsPlay(false); }
  }, [open]);
  useEffect(() => {
    // The dialog portal can mount after the open effect. Start only once its
    // actual video is attached, rather than decoding into a detached element.
    if (!open || !videoElement) return undefined;
    let cancelled = false;
    let controls;
    let stream;
    let frameTimer;
    let rejectFrames;
    let cancelPlayWait;
    const stop = () => { controls?.stop(); stream?.getTracks().forEach(track=>track.stop()); };
    setError(''); setReady(false); setNeedsPlay(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost. Use the USB scanner or type the barcode here.');
        const reader = await createBarcodeReader();
        if (cancelled) return;
        // Set properties before assigning srcObject. Safari may reject playback
        // while the portal is entering; ZXing swallows that rejection, which
        // previously left a black preview labelled as ready indefinitely.
        videoElement.muted = true; videoElement.defaultMuted = true;
        videoElement.playsInline = true;
        videoElement.setAttribute('muted',''); videoElement.setAttribute('playsinline','');
        videoElement.setAttribute('webkit-playsinline','');
        stream = await acquireCamera();
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        videoElement.srcObject = stream;
        const startPlayback = async () => {
          try { await videoElement.play(); setNeedsPlay(false); return true; }
          catch { if (!cancelled) setNeedsPlay(true); return false; }
        };
        if (!await startPlayback()) {
          await new Promise((resolve) => { cancelPlayWait = resolve; resume.current = async () => { if (await startPlayback()) resolve(); }; });
        }
        if (cancelled) return;
        // Metadata alone does not mean a frame was delivered. Bound the wait
        // and offer recovery rather than keeping a camera light on forever.
        await new Promise((resolve,reject) => {
          rejectFrames = reject;
          const started = Date.now();
          const check = () => {
            if (cancelled) return reject(new Error('Camera closed'));
            if (videoElement.readyState >= 2 && videoElement.videoWidth > 0 && !videoElement.paused) return resolve();
            if (Date.now()-started > 8000) return reject(new Error('The camera is on but no preview arrived. Try again, or read a photo of the barcode.'));
            frameTimer = setTimeout(check,100);
          };
          check();
        });
        if (cancelled) return;
        controls = await reader.decodeFromVideoElement(videoElement, (result) => {
          if (!result || cancelled) return;
          cancelled = true;
          stop();
          callback.current(result.getText());
        });
        if (cancelled) controls.stop();
        else setReady(true);
      } catch (err) {
        stop();
        if (!cancelled) setError(err.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser, or use your scanner.' : err.name === 'NotFoundError' ? 'No camera was found. Use your USB scanner or type the barcode.' : err.message || 'Could not start the camera. Close other camera apps and try again.');
      }
    })();
    return () => {
      cancelled = true; stop(); clearTimeout(frameTimer); rejectFrames?.(new Error('Camera closed')); cancelPlayWait?.(); resume.current = null;
      videoElement.pause();
      if (videoElement) videoElement.srcObject = null;
    };
  }, [open, videoElement, attempt]);
  return <Modal open={open} onClose={onClose} title={translate("Scan with camera")} size="md" footer={<Button variant="secondary" onClick={onClose}>{translate("Close camera")}</Button>}>
    <p className="text-sm text-content-muted mb-4">{translate("Hold the full barcode steady in good light. One label is read at a time.")}</p>
    <div className="barcode-camera"><video ref={setVideoElement} muted playsInline autoPlay aria-label={translate("Barcode camera preview")} /><span className="barcode-camera-guide" aria-hidden="true" /></div>
    {error && <div className="mt-3 space-y-3"><p role="alert" className="text-sm text-red-600 dark:text-red-400">{translate(error)}</p><Button variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{translate('Try camera again')}</Button></div>}
    {needsPlay && !error && <Button className="mt-3" onClick={()=>resume.current?.()}>{translate('Start camera preview')}</Button>}
    {!error && <p role="status" className="text-caption text-content-muted mt-3">{translate(ready ? 'Looking for a barcode…' : 'Starting camera…')}</p>}
  </Modal>;
}
