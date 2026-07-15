import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capgo/capacitor-speech-recognition";

export type VoiceRecognitionCallbacks = {
  contextualStrings: string[];
  onEnd: (transcript: string) => void;
  onError: (message: string) => void;
  onTranscript: (transcript: string) => void;
};

export type VoiceRecognitionSession = {
  stop: () => Promise<void>;
};

export function buildVoiceContext(categories: string[], subcategories: string[]) {
  return Array.from(new Set(["Gasto", "Ingreso", "TC", ...categories, ...subcategories])).filter(Boolean);
}

export async function startVoiceRecognition(callbacks: VoiceRecognitionCallbacks): Promise<VoiceRecognitionSession> {
  return Capacitor.isNativePlatform()
    ? startNativeRecognition(callbacks)
    : startBrowserRecognition(callbacks);
}

async function startNativeRecognition({ contextualStrings, onEnd, onError, onTranscript }: VoiceRecognitionCallbacks): Promise<VoiceRecognitionSession> {
  const permissions = await SpeechRecognition.requestPermissions();
  if (permissions.speechRecognition !== "granted") throw new Error("Microphone permission was denied.");

  const support = await SpeechRecognition.available();
  if (!support.available) throw new Error("Voice input is not available on this Android device.");

  const onDevice = await SpeechRecognition.isOnDeviceRecognitionAvailable({ language: "es-CO" });
  let latestTranscript = "";
  let finished = false;
  const listeners = await Promise.all([
    SpeechRecognition.addListener("partialResults", (event) => {
      const next = event.accumulatedText || event.accumulated || event.matches?.[0] || "";
      if (!next) return;
      latestTranscript = next;
      onTranscript(next);
    }),
    SpeechRecognition.addListener("error", (event) => onError(event.message || "I could not hear a complete transaction. Try again.")),
  ]);

  const finish = async () => {
    if (finished) return;
    finished = true;
    const final = await SpeechRecognition.getLastPartialResult();
    if (final.text) latestTranscript = final.text;
    await Promise.all(listeners.map((listener) => listener.remove()));
    onEnd(latestTranscript);
  };

  const stateListener = await SpeechRecognition.addListener("listeningState", (event) => {
    if (event.state === "stopped" || event.status === "stopped") void finish();
  });
  listeners.push(stateListener);

  await SpeechRecognition.start({
    allowForSilence: 4000,
    contextualStrings,
    language: "es-CO",
    maxResults: 1,
    partialResults: true,
    popup: false,
    useOnDeviceRecognition: onDevice.available,
  });

  return {
    async stop() {
      await SpeechRecognition.forceStop();
      await finish();
    },
  };
}

function startBrowserRecognition({ onEnd, onError, onTranscript }: VoiceRecognitionCallbacks): VoiceRecognitionSession {
  type Recognition = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onend: (() => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    start: () => void;
    stop: () => void;
  };
  type RecognitionConstructor = new () => Recognition;
  const browser = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  const RecognitionApi = browser.SpeechRecognition || browser.webkitSpeechRecognition;
  if (!RecognitionApi) throw new Error("Voice input is not supported in this browser. Try Chrome or Edge.");

  let latestTranscript = "";
  const recognition = new RecognitionApi();
  recognition.lang = "es-CO";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    latestTranscript = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
    if (latestTranscript) onTranscript(latestTranscript);
  };
  recognition.onerror = (event) => onError(event.error === "not-allowed" ? "Microphone permission was denied." : "I could not hear a complete transaction. Try again.");
  recognition.onend = () => onEnd(latestTranscript);
  recognition.start();
  return { stop: async () => recognition.stop() };
}
