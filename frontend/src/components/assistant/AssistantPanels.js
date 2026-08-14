import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../utils/toast';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiCamera,
  FiCheck,
  FiImage,
  FiLoader,
  FiMic,
  FiMicOff,
  FiSend,
  FiUpload,
  FiX,
} from 'react-icons/fi';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import {
  confirmTransaction,
  fetchBriefing,
  getAiErrorMessage,
  parseIntent,
  saveCashEntry,
  scanCashReceipt,
  scanDeliveryNote,
  sendChatMessage,
  sendVoiceAudio,
} from '../../services/assistantApi';
import { useAssistant } from '../../context/AssistantContext';
import { formatMoney } from '../../utils/currency';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import {
  ASSISTANT_STROKE,
  AssistantIconWell,
  AssistantMediaFrame,
  AssistantMicButton,
} from './AssistantChrome';
import { BiLine, BiPair, BilingualBlock } from './AssistantCopy';
import {
  canUseMediaRecorder,
  formatFromMime,
  getMicPermissionState,
  micErrorMessage,
  pickRecorderMimeType,
  requestMicrophoneAccess,
} from '../../utils/microphone';
import { feedbackTick, unlockFeedbackAudio } from '../../utils/feedback';

function ConfirmTransactionFooter({ intent, onDone, onCancel }) {
  const { currencySymbol } = useSettings();
  const [saving, setSaving] = useState(false);
  const tx = intent?.proposedTransaction;

  const handleConfirm = async () => {
    if (!tx) return;
    setSaving(true);
    try {
      await confirmTransaction({
        type: tx.type,
        product: tx.product,
        quantity: tx.quantity,
        price: tx.price,
        customer: tx.customer || undefined,
        supplier: tx.supplier || undefined,
        notes: 'Recorded via AI assistant',
      });
      toast.success('Transaction saved');
      onDone();
    } catch (error) {
      toast.error(getAiErrorMessage(error, 'Could not save the transaction'));
    } finally {
      setSaving(false);
    }
  };

  if (!tx) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] bg-surface-sunken shadow-[inset_0_0_0_1px_rgb(var(--hairline)/0.08)] p-4 text-sm space-y-1">
        <p className="font-medium text-content text-balance">{tx.productName}</p>
        <p className="text-content-muted tabular-nums">
          {tx.type === 'stock_out' ? (
            <BiPair en="Sale" />
          ) : (
            <BiPair en="Stock in" />
          )}
          <span>
            {' '}
            — {tx.quantity} {tx.unit}
          </span>
        </p>
        {tx.price != null && (
          <p className="text-content-muted tabular-nums">
            Total: {formatMoney(tx.quantity * tx.price, currencySymbol)}
          </p>
        )}
        {tx.customer && <p className="text-content-muted">Customer: {tx.customer}</p>}
        {tx.supplier && <p className="text-content-muted">Supplier: {tx.supplier}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={saving}>
          <BiLine en="Cancel" size="sm" align="center" />
        </Button>
        <Button fullWidth loading={saving} icon={FiCheck} onClick={handleConfirm}>
          <BiLine en="Confirm" size="sm" align="center" />
        </Button>
      </div>
    </div>
  );
}

function ChatPanel({ onClose }) {
  const { handleNavigateIntent } = useAssistant();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Type a question or tap the mic to speak.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingIntent, setPendingIntent] = useState(null);
  const [micState, setMicState] = useState('prompt');
  const [micBannerDismissed, setMicBannerDismissed] = useState(false);
  const endRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, pendingIntent, recording]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await getMicPermissionState();
      if (!cancelled) setMicState(state);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  }, []);

  // Tracks whether this panel is still mounted, so async work that resolves
  // after it closes (a permission prompt, a recorder's onstop) can bail out.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopRecording();
    };
  }, [stopRecording]);

  const appendAssistant = (text) => {
    setMessages((m) => [...m, { role: 'assistant', text }]);
  };

  const handleVoiceResult = async (data) => {
    const transcript = data.transcript?.trim();
    if (!transcript) {
      toast.error('Could not hear anything. Try again.');
      return;
    }

    setMessages((m) => [...m, { role: 'user', text: transcript, viaVoice: true }]);
    setPendingIntent(null);

    const intent = data.intent;
    if (intent?.requiresConfirmation) {
      setPendingIntent(intent);
      appendAssistant(
        `${intent.message || 'Confirm this transaction below.'}`
      );
      return;
    }

    if (intent?.action === 'navigate' && intent.destination) {
      appendAssistant(`${intent.message || `Opening ${intent.destination}.`}`);
      handleNavigateIntent(intent.destination);
      return;
    }

    if (intent?.action === 'stock_check' && intent.data) {
      appendAssistant(
        `${intent.message}\n\n${intent.data.currentStock} ${intent.data.unit}`
      );
      return;
    }

    if (intent?.message && intent.action && intent.action !== 'unknown' && intent.action !== 'general_question') {
      appendAssistant(intent.message);
      return;
    }

    // Conversational follow-up for open questions
    setLoading(true);
    try {
      const { reply } = await sendChatMessage(transcript);
      appendAssistant(reply);
    } catch (error) {
      const msg = getAiErrorMessage(error, 'Could not get a reply');
      toast.error(msg);
      appendAssistant(`${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const enableMicrophone = async () => {
    unlockFeedbackAudio();
    try {
      await requestMicrophoneAccess({ keepAlive: false });
      setMicState('granted');
      feedbackTick();
      toast.success('Microphone ready', { feedback: 'tick' });
    } catch (error) {
      const state = await getMicPermissionState();
      setMicState(state === 'prompt' ? 'denied' : state);
      toast.error(micErrorMessage(error));
    }
  };

  const startRecording = async () => {
    if (loading || recording) return;
    unlockFeedbackAudio();

    if (!canUseMediaRecorder()) {
      toast.error(micErrorMessage({ code: 'unsupported' }));
      setMicState('unsupported');
      return;
    }

    try {
      const stream = await requestMicrophoneAccess({ keepAlive: true });

      // getUserMedia can resolve long after this panel closed — the user may
      // have been looking at the permission sheet when they dismissed it. The
      // unmount cleanup already ran and found empty refs, so without this the
      // stream is assigned to a ref nobody reads, the recorder starts, and the
      // browser's red recording indicator stays on until the tab is closed.
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setMicState('granted');

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const usedMime = recorder.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        // The panel was closed mid-recording, so this is an abandoned clip.
        // Uploading it anyway spends an API call transcribing half a sentence
        // and fires a toast for a screen the user has already left.
        if (!aliveRef.current) return;

        const blob = new Blob(chunksRef.current, { type: usedMime });
        if (blob.size < 500) {
          toast.error('Recording too short. Hold a bit longer.');
          return;
        }
        setLoading(true);
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const data = await sendVoiceAudio(base64, formatFromMime(usedMime));
          await handleVoiceResult(data);
        } catch (error) {
          toast.error(getAiErrorMessage(error, 'Could not process voice'));
        } finally {
          setLoading(false);
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
      setPendingIntent(null);
      feedbackTick();
    } catch (error) {
      const state = await getMicPermissionState();
      setMicState(state === 'prompt' ? 'denied' : state);
      toast.error(micErrorMessage(error));
    }
  };

  const toggleMic = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const micBlocked = micState === 'denied' || micState === 'unsupported' || micState === 'insecure';
  const showMicBanner =
    !micBannerDismissed &&
    !recording &&
    (micState === 'prompt' || micState === 'denied' || micState === 'insecure' || micState === 'unsupported');

  const send = async () => {
    const text = input.trim();
    if (!text || loading || recording) return;
    setInput('');
    setPendingIntent(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const { reply } = await sendChatMessage(text);
      appendAssistant(reply);
    } catch (error) {
      const msg = getAiErrorMessage(error, 'Could not get a reply');
      toast.error(msg);
      appendAssistant(`${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Chat & Voice"
      description={<BiLine en="Type or speak · Urdu understood, replies in English" size="sm" />}
      size="lg"
      /* The composer lives in the footer, not in the scrolling body.
         Modal's footer is sticky and already carries
         `pb-[max(0.875rem,env(safe-area-inset-bottom))]`, and Modal clamps the
         sheet to `visualViewport.height`. Inside the body it sat below the fold
         the moment the keyboard opened — on a 375×667 iPhone the visible pane
         is about 300px — so the user had to scroll a bottom sheet to reach the
         field they had just tapped. */
      footer={
        pendingIntent?.requiresConfirmation ? (
          <ConfirmTransactionFooter
            intent={pendingIntent}
            onDone={() => {
              setPendingIntent(null);
              appendAssistant('Saved.');
            }}
            onCancel={() => setPendingIntent(null)}
          />
        ) : (
          <div className="flex gap-2 items-end">
            <AssistantMicButton
              recording={recording}
              onClick={toggleMic}
              disabled={(loading && !recording) || (micBlocked && !recording)}
            />
            <Input
              className="flex-1 min-w-0"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={recording ? 'Listening…' : 'Ask anything…'}
              disabled={recording}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            />
            <Button
              icon={FiSend}
              onClick={send}
              loading={loading && !recording}
              disabled={recording}
              aria-label="Send message"
            />
          </div>
        )
      }
    >
      {/* `min-h-0 flex-1` on phones so the transcript gives its height back to
          the sheet when the keyboard takes the screen; the comfortable fixed
          height only applies from `sm` up, where there is room for it. */}
      <div className="flex flex-col -my-5 -mx-5 sm:-mx-6 min-h-0 flex-1 sm:min-h-[420px] sm:max-h-[60vh]">
        {showMicBanner && (
          <div className="mx-5 sm:mx-6 mt-1 mb-1 rounded-[14px] bg-primary-500/[0.08] shadow-[inset_0_0_0_1px_rgb(var(--primary-500)/0.18)] px-3.5 py-3 flex gap-3 items-start">
            <span className="mt-0.5 text-primary-600 dark:text-primary-400" aria-hidden="true">
              {micBlocked ? (
                <FiMicOff className="w-4 h-4" strokeWidth={ASSISTANT_STROKE} />
              ) : (
                <FiMic className="w-4 h-4" strokeWidth={ASSISTANT_STROKE} />
              )}
            </span>
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-sm text-content text-pretty">
                {micState === 'insecure'
                  ? 'Voice needs HTTPS on phones. Typing still works.'
                  : micState === 'unsupported'
                    ? 'This browser cannot record audio. Typing still works.'
                    : micState === 'denied'
                      ? 'Microphone is blocked. Allow it in site settings, or keep typing.'
                      : 'Allow the microphone once so you can speak orders. Or skip and type.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(micState === 'prompt' || micState === 'denied') && (
                  <Button size="sm" onClick={enableMicrophone}>
                    {micState === 'denied' ? 'Try again' : 'Allow microphone'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setMicBannerDismissed(true)}>
                  Use typing
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3.5">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`max-w-[92%] px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'ml-auto rounded-[18px] rounded-br-md bg-primary-600 text-white shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.14)]'
                  : 'mr-auto rounded-[18px] rounded-bl-md bg-surface-sunken shadow-[inset_0_0_0_1px_rgb(var(--hairline)/0.08)]'
              }`}
            >
              {msg.role === 'user' ? (
                <div>
                  {msg.viaVoice && (
                    <p className="text-[10px] uppercase tracking-wide opacity-80 mb-1.5 flex items-center gap-1.5 font-medium">
                      <FiMic className="w-3 h-3" strokeWidth={2} aria-hidden="true" /> Voice
                    </p>
                  )}
                  <p
                    className={`whitespace-pre-wrap text-pretty ${
                      /[\u0600-\u06FF]/.test(msg.text) ? 'assistant-ur' : 'assistant-en'
                    }`}
                    lang={/[\u0600-\u06FF]/.test(msg.text) ? 'ur' : 'en'}
                    dir={/[\u0600-\u06FF]/.test(msg.text) ? 'rtl' : 'ltr'}
                  >
                    {msg.text}
                  </p>
                </div>
              ) : (
                <BilingualBlock text={msg.text} />
              )}
            </div>
          ))}
          {recording && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
              <BiLine en="Listening… tap mic to stop" size="sm" />
            </div>
          )}
          {loading && !recording && (
            <div className="flex items-center gap-2 text-sm text-content-subtle">
              <FiLoader className="animate-spin w-4 h-4" strokeWidth={ASSISTANT_STROKE} aria-hidden="true" />{' '}
              Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
    </Modal>
  );
}

function BriefingPanel({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchBriefing()
      .then(setData)
      .catch((err) => setError(getAiErrorMessage(err, 'Could not load briefing')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Daily Briefing"
      description={<BiLine en="Today's summary" size="sm" />}
      size="lg"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-content-subtle">
          <FiLoader className="animate-spin" /> Building snapshot…
        </div>
      ) : error ? (
        <div className="text-center py-10 space-y-4">
          <p className="text-sm text-content-muted">{error}</p>
          <Button onClick={load}>
            <BiLine en="Try again" size="sm" align="center" />
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2.5">
              <BiLine en="Overview" size="sm" />
            </h3>
            <BilingualBlock text={data?.briefing} />
          </section>
          {data?.restock && (
            <section>
              <h3 className="mb-2.5">
                <BiLine en="Restock" size="sm" />
              </h3>
              <BilingualBlock text={data.restock} />
            </section>
          )}
          {data?.anomalies && (
            <section>
              <h3 className="mb-2.5">
                <BiLine en="Alerts" size="sm" />
              </h3>
              <BilingualBlock text={data.anomalies} />
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({
        base64: dataUrl.split(',')[1],
        preview: dataUrl,
        mimeType: file.type || 'image/jpeg',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ScanPanel({ onClose }) {
  const navigate = useNavigate();
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({
    product: '',
    quantity: '',
    supplier: '',
    reference: '',
    notes: '',
  });

  const applyResult = (data) => {
    setResult(data);
    const tx = data.proposedTransaction;
    setForm({
      product: tx?.product || data.product?.id || '',
      quantity: tx?.quantity != null ? String(tx.quantity) : data.extracted?.quantity != null ? String(data.extracted.quantity) : '',
      supplier: tx?.supplier || data.extracted?.supplier || '',
      reference: tx?.reference || data.extracted?.reference || '',
      notes: tx?.notes || data.extracted?.notes || 'From AI delivery note scan',
    });
  };

  const processFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image of the delivery slip (JPG or PNG).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('That image is over 8MB. Try a smaller photo.');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const { base64, preview: url, mimeType } = await fileToBase64(file);
      setPreview(url);
      const data = await scanDeliveryNote(base64, mimeType);
      applyResult(data);
      if (!data.product && data.extracted?.productName) {
        toast.message(`Found “${data.extracted.productName}” — pick the matching product below.`);
      }
    } catch (error) {
      toast.error(getAiErrorMessage(error, 'Could not read the note. Try a clearer photo.'));
    } finally {
      setLoading(false);
    }
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    await processFile(file);
  };

  const goToTransactions = () => {
    if (!form.product) {
      toast.error('Choose which product this slip is for.');
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      toast.error('Enter a quantity greater than zero.');
      return;
    }

    const selected = (result?.candidates || []).find((p) => p.id === form.product) || result?.product;
    onClose();
    navigate('/transactions', {
      state: {
        aiScan: {
          proposedTransaction: {
            type: 'stock_in',
            product: form.product,
            productName: selected?.name,
            quantity: Number(form.quantity),
            unit: selected?.unit,
            supplier: form.supplier || null,
            reference: form.reference || null,
            notes: form.notes || null,
          },
          product: selected
            ? { id: selected.id, name: selected.name, unit: selected.unit, costPrice: selected.costPrice }
            : null,
        },
      },
    });
    toast.success('Opening stock-in — review and save');
  };

  const clearScan = () => {
    setPreview(null);
    setResult(null);
    setForm({ product: '', quantity: '', supplier: '', reference: '', notes: '' });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Scan Delivery Note"
      description={<BiLine en="Photo of supplier slip" size="sm" />}
      size="lg"
      footer={
        result ? (
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="secondary" onClick={clearScan} disabled={loading}>
              Scan another
            </Button>
            <Button icon={FiCheck} onClick={goToTransactions} disabled={loading}>
              Review stock-in
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        {!result && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`rounded-[20px] border-2 border-dashed p-5 text-center transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
                dragging
                  ? 'border-primary-500 bg-primary-500/5'
                  : 'border-hairline/[0.15] bg-surface-sunken/40'
              }`}
            >
              {preview ? (
                <AssistantMediaFrame src={preview} alt="Slip preview" className="mx-auto mb-4 max-w-sm" />
              ) : (
                <div className="flex flex-col items-center gap-2.5 mb-4 text-content-subtle">
                  <AssistantIconWell icon={FiImage} size="lg" tone="muted" />
                  <p className="assistant-en-sm text-content text-pretty" lang="en">
                    Drop a photo here, or use the buttons below
                  </p>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-content-muted py-2">
                  <FiLoader className="animate-spin w-4 h-4" strokeWidth={ASSISTANT_STROKE} aria-hidden="true" />{' '}
                  Reading the slip…
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      processFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      processFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <Button icon={FiCamera} onClick={() => cameraRef.current?.click()}>
                    Take photo
                  </Button>
                  <Button variant="secondary" icon={FiUpload} onClick={() => fileRef.current?.click()}>
                    Upload file
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-content-subtle text-center">
              Tip: photograph the whole slip in good light. Blurry photos are harder to read.
            </p>
          </>
        )}

        {result && (
          <div className="space-y-4">
            {preview && (
              <AssistantMediaFrame src={preview} alt="Scanned slip" className="max-h-40 [&_img]:max-h-40" />
            )}

            <div className="rounded-[14px] px-4 py-3 text-sm text-content text-pretty
              bg-primary-500/5 shadow-[inset_0_0_0_1px_rgb(var(--color-primary-500)/0.2)]">
              {result.extracted?.productName
                ? `AI read: ${result.extracted.productName}${result.extracted.quantity != null ? ` · ${result.extracted.quantity}` : ''}`
                : 'Could not read a clear product name — pick one below.'}
            </div>

            <Select
              label="Product"
              required
              value={form.product}
              onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
            >
              <option value="">Select the matching product…</option>
              {(result.candidates || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Quantity"
                required
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className="tabular-nums"
              />
              <Input
                label="Supplier"
                value={form.supplier}
                onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                placeholder="Who delivered this"
              />
            </div>

            <Input
              label="Reference"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="Invoice or delivery number"
            />

            <Textarea
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function CashReceiptPanel({ onClose }) {
  const navigate = useNavigate();
  const { currencySymbol } = useSettings();
  const { can } = useAuth();
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [categories, setCategories] = useState({ in: [], out: [] });
  const [form, setForm] = useState({
    direction: 'out',
    amount: '',
    category: '',
    purpose: '',
    party: '',
    reference: '',
    notes: '',
    occurredAt: new Date().toISOString().slice(0, 10),
  });
  const [scanned, setScanned] = useState(false);

  const categoryOptions = form.direction === 'in' ? categories.in : categories.out;

  const applyResult = (data) => {
    const entry = data.proposedEntry || {};
    setCategories(data.categories || { in: [], out: [] });
    setForm({
      direction: entry.direction || 'out',
      amount: entry.amount != null ? String(entry.amount) : '',
      category: entry.category || '',
      purpose: entry.purpose || '',
      party: entry.party || '',
      reference: entry.reference || '',
      notes: entry.notes || 'From AI receipt scan',
      occurredAt: String(entry.occurredAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    });
    setScanned(true);
  };

  const processFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image of the receipt (JPG or PNG).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('That image is over 8MB. Try a smaller photo.');
      return;
    }

    setLoading(true);
    setScanned(false);
    try {
      const { base64, preview: url, mimeType } = await fileToBase64(file);
      setPreview(url);
      const data = await scanCashReceipt(base64, mimeType);
      applyResult(data);
    } catch (error) {
      toast.error(getAiErrorMessage(error, 'Could not read the receipt. Try a clearer photo.'));
    } finally {
      setLoading(false);
    }
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setDragging(false);
    await processFile(event.dataTransfer?.files?.[0]);
  };

  const clearScan = () => {
    setPreview(null);
    setScanned(false);
    setForm({
      direction: 'out',
      amount: '',
      category: '',
      purpose: '',
      party: '',
      reference: '',
      notes: '',
      occurredAt: new Date().toISOString().slice(0, 10),
    });
  };

  const handleConfirm = async () => {
    if (!can('cash.manage')) {
      toast.error('Your account cannot record cash entries.');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter an amount greater than zero.');
      return;
    }
    if (!form.purpose.trim()) {
      toast.error('Add a short purpose for this entry.');
      return;
    }

    setSaving(true);
    try {
      await saveCashEntry({
        direction: form.direction,
        amount,
        category: form.category || (form.direction === 'in' ? 'Other income' : 'Other expense'),
        purpose: form.purpose.trim(),
        party: form.party.trim(),
        reference: form.reference.trim(),
        notes: form.notes.trim(),
        occurredAt: new Date(form.occurredAt).toISOString(),
      });
      toast.success(form.direction === 'in' ? 'Money in recorded' : 'Money out recorded');
      onClose();
      navigate('/cash-book');
    } catch (error) {
      toast.error(getAiErrorMessage(error, 'Could not save the cash entry'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Scan Receipt"
      description={<BiLine en="Photo → money in / money out" size="sm" />}
      size="lg"
      footer={
        scanned ? (
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="secondary" onClick={clearScan} disabled={saving}>
              Scan another
            </Button>
            <Button
              icon={FiCheck}
              loading={saving}
              variant={form.direction === 'in' ? 'success' : 'danger'}
              onClick={handleConfirm}
            >
              {form.direction === 'in' ? 'Confirm money in' : 'Confirm money out'}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        {!scanned && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`rounded-[20px] border-2 border-dashed p-5 text-center transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
                dragging
                  ? 'border-primary-500 bg-primary-500/5'
                  : 'border-hairline/[0.15] bg-surface-sunken/40'
              }`}
            >
              {preview ? (
                <AssistantMediaFrame src={preview} alt="Receipt preview" className="mx-auto mb-4 max-w-sm" />
              ) : (
                <div className="flex flex-col items-center gap-2.5 mb-4 text-content-subtle">
                  <AssistantIconWell icon={FiImage} size="lg" tone="muted" />
                  <p className="assistant-en-sm text-content text-pretty" lang="en">
                    Drop a receipt photo, or use the buttons
                  </p>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-content-muted py-2">
                  <FiLoader className="animate-spin w-4 h-4" strokeWidth={ASSISTANT_STROKE} aria-hidden="true" />{' '}
                  Reading the receipt…
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      processFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      processFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <Button icon={FiCamera} onClick={() => cameraRef.current?.click()}>
                    Take photo
                  </Button>
                  <Button variant="secondary" icon={FiUpload} onClick={() => fileRef.current?.click()}>
                    Upload file
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-content-subtle text-center">
              Works for shop bills, expenses, and payment slips. Nothing is saved until you confirm.
            </p>
          </>
        )}

        {scanned && (
          <div className="space-y-4">
            {preview && (
              <AssistantMediaFrame src={preview} alt="Scanned receipt" className="[&_img]:max-h-36" />
            )}

            <div className="grid grid-cols-2 gap-1 p-1 bg-surface-sunken rounded-[14px]
              shadow-[inset_0_0_0_1px_rgb(var(--hairline)/0.08)]">
              {[
                { value: 'in', label: 'Money in', icon: FiArrowDownLeft },
                { value: 'out', label: 'Money out', icon: FiArrowUpRight },
              ].map(({ value, label, icon: Icon }) => {
                const selected = form.direction === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        direction: value,
                        category:
                          value === 'in'
                            ? categories.in.includes(f.category)
                              ? f.category
                              : 'Other income'
                            : categories.out.includes(f.category)
                              ? f.category
                              : 'Other expense',
                      }))
                    }
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-[10px] text-sm font-medium
                      transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
                      active:scale-[0.96] motion-reduce:active:scale-100
                      ${
                        selected
                          ? value === 'in'
                            ? 'segmented-thumb text-emerald-600 dark:text-emerald-400'
                            : 'segmented-thumb text-red-600 dark:text-red-400'
                          : 'text-content-muted hover:text-content'
                      }`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={selected ? 2 : ASSISTANT_STROKE} aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Amount"
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                prefix={currencySymbol}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="tabular-nums"
              />
              <Input
                label="Date"
                type="date"
                value={form.occurredAt}
                onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
              />
            </div>

            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>

            <Input
              label="Purpose"
              required
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="What was this for?"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={form.direction === 'in' ? 'Received from' : 'Paid to / taken by'}
                value={form.party}
                onChange={(e) => setForm((f) => ({ ...f, party: e.target.value }))}
              />
              <Input
                label="Reference"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Receipt number"
              />
            </div>

            <Textarea
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function AssistantPanels() {
  const { panel, closePanel } = useAssistant();

  if (!panel) return null;

  switch (panel) {
    case 'chat':
    case 'voice':
      return <ChatPanel onClose={closePanel} />;
    case 'briefing':
      return <BriefingPanel onClose={closePanel} />;
    case 'scan':
      return <ScanPanel onClose={closePanel} />;
    case 'scan-receipt':
      return <CashReceiptPanel onClose={closePanel} />;
    default:
      return null;
  }
}

export function TextCommandBar({ onClose }) {
  const { handleNavigateIntent } = useAssistant();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    const value = text.trim();
    if (!value || loading) return;
    setLoading(true);
    try {
      const data = await parseIntent(value);
      setResult(data);
    } catch (error) {
      toast.error(getAiErrorMessage(error, 'Could not understand that'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a command…"
      />
      <div className="flex gap-2">
        <Button variant="ghost" icon={FiX} onClick={onClose}>
          Close
        </Button>
        <Button fullWidth loading={loading} onClick={run}>
          Run
        </Button>
      </div>
      {result?.intent?.requiresConfirmation && (
        <ConfirmTransactionFooter intent={result.intent} onDone={onClose} onCancel={() => setResult(null)} />
      )}
      {result?.intent?.action === 'navigate' && result.intent.destination && (
        <Button fullWidth onClick={() => handleNavigateIntent(result.intent.destination)}>
          Open {result.intent.destination}
        </Button>
      )}
    </div>
  );
}
