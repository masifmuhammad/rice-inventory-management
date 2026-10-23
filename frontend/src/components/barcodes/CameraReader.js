import React, { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { createBarcodeReader } from '../../utils/barcodeReader';
import { translate, useAppLanguage } from '../../context/LanguageContext';

export default function CameraReader({ open, onClose, onRead }) {
  useAppLanguage();
  const [videoElement, setVideoElement] = useState(null);
  const callback = useRef(onRead);
  callback.current = onRead;
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (open) { setError(''); setReady(false); }
  }, [open]);
  useEffect(() => {
    // The dialog portal can mount after the open effect. Start only once its
    // actual video is attached, rather than decoding into a detached element.
    if (!open || !videoElement) return undefined;
    let cancelled = false;
    let controls;
    let stream;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost. Use the USB scanner or type the barcode here.');
        const reader = await createBarcodeReader();
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        controls = await reader.decodeFromStream(stream, videoElement, (result) => {
          if (!result || cancelled) return;
          cancelled = true;
          controls?.stop();
          stream?.getTracks().forEach((track) => track.stop());
          callback.current(result.getText());
        });
        if (cancelled) controls.stop();
        else setReady(true);
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop());
        if (!cancelled) setError(err.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser, or use your scanner.' : err.name === 'NotFoundError' ? 'No camera was found. Use your USB scanner or type the barcode.' : err.message || 'Could not start the camera. Close other camera apps and try again.');
      }
    })();
    return () => {
      cancelled = true; controls?.stop(); stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [open, videoElement]);
  return <Modal open={open} onClose={onClose} title={translate("Scan with camera")} size="md" footer={<Button variant="secondary" onClick={onClose}>{translate("Close camera")}</Button>}>
    <p className="text-sm text-content-muted mb-4">{translate("Hold the full barcode steady in good light. One label is read at a time.")}</p>
    {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{translate(error)}</p> : <div className="barcode-camera"><video ref={setVideoElement} muted playsInline autoPlay aria-label={translate("Barcode camera preview")} /><span className="barcode-camera-guide" aria-hidden="true" /></div>}
    {!error && <p role="status" className="text-caption text-content-muted mt-3">{translate(ready ? 'Looking for a barcode…' : 'Starting camera…')}</p>}
  </Modal>;
}
