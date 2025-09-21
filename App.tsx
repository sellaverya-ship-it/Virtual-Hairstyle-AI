import React, { useState, useRef, useCallback } from 'react';
import { analyzeFaceShape, generateHairstyleImage } from './services/geminiService';
import { AppState, AnalysisResult, HaircutPreference } from './types';
import { CameraIcon, SparklesIcon, UploadIcon, ResetIcon } from './components/icons';

// Helper to convert file to base64
const toBase64 = (file: File): Promise<{ base64: string, mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mimeType = result.split(';')[0].split(':')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = (error) => reject(error);
  });

// Spinner Component
const Spinner: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center space-y-3 h-full">
    <div className="w-12 h-12 border-4 border-pink-300 border-t-pink-500 rounded-full animate-spin"></div>
    <p className="text-gray-600 animate-pulse">{message}</p>
  </div>
);

// Camera Capture Modal
const CameraCapture: React.FC<{ onCapture: (file: File) => void; onCancel: () => void; }> = ({ onCapture, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    React.useEffect(() => {
        const enableCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
                alert("Tidak dapat mengakses kamera. Pastikan izin telah diberikan.");
                onCancel();
            }
        };
        enableCamera();

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                context.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
                canvasRef.current.toBlob(blob => {
                    if (blob) {
                        const file = new File([blob], "selfie.png", { type: "image/png" });
                        onCapture(file);
                    }
                }, 'image/png');
            }
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 shadow-xl max-w-lg w-full">
                <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-md mb-4"></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
                <div className="flex justify-between">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-300 rounded-lg text-gray-800 hover:bg-gray-400 transition">Batal</button>
                    <button onClick={handleCapture} className="px-4 py-2 bg-pink-500 rounded-lg text-white hover:bg-pink-600 transition flex items-center space-x-2">
                        <CameraIcon className="w-5 h-5"/>
                        <span>Ambil Gambar</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

const haircutPreferences: { value: HaircutPreference; label: string }[] = [
    { value: "Sedang", label: "Potongan Sedang" },
    { value: "Pendek", label: "Potongan Pendek" },
    { value: "Super Pendek", label: "Potongan Super Pendek" },
];

interface GeneratedImageState {
  [key: string]: { // key is hairstyle name
    url: string | null;
    error: string | null;
    loading: boolean;
  };
}


export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.INITIAL);
  const [originalImage, setOriginalImage] = useState<{ url: string; base64: string; mimeType: string } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [haircutPreference, setHaircutPreference] = useState<HaircutPreference | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageState>({});
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setAppState(AppState.INITIAL);
    setOriginalImage(null);
    setAnalysisResult(null);
    setHaircutPreference(null);
    setGeneratedImages({});
    setError(null);
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };
  
  const processFile = async (file: File) => {
    handleReset();
    try {
        const { base64, mimeType } = await toBase64(file);
        setOriginalImage({ url: URL.createObjectURL(file), base64, mimeType });
        setAppState(AppState.IMAGE_UPLOADED);
    } catch (err) {
        setError("Tidak dapat memproses file gambar. Silakan coba lagi.");
        setAppState(AppState.ERROR);
    }
  };

  const handleAnalyzeClick = useCallback(async () => {
    if (!originalImage) return;
    setAppState(AppState.ANALYZING);
    setError(null);
    setHaircutPreference(null);
    setGeneratedImages({});
    try {
      const result = await analyzeFaceShape(originalImage.base64, originalImage.mimeType);
      setAnalysisResult(result);
      setAppState(AppState.ANALYZED);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan yang tidak diketahui saat analisis.');
      setAppState(AppState.ERROR);
    }
  }, [originalImage]);
  
  const handlePreferenceSelect = useCallback(async (preference: HaircutPreference) => {
    if (!originalImage || !analysisResult || appState === AppState.GENERATING) return;
    
    setHaircutPreference(preference);
    setAppState(AppState.GENERATING);
    
    const initialImageStates: GeneratedImageState = {};
    analysisResult.hairstyles.forEach(style => {
        initialImageStates[style.name] = { url: null, error: null, loading: true };
    });
    setGeneratedImages(initialImageStates);

    const generationPromises = analysisResult.hairstyles.map(style =>
      generateHairstyleImage(
        originalImage.base64,
        originalImage.mimeType,
        style.name,
        analysisResult.originalHairLength,
        preference
      )
      .then(result => {
        setGeneratedImages(prev => ({
          ...prev,
          [style.name]: { url: result.imageUrl, error: null, loading: false }
        }));
        return { status: 'fulfilled' };
      })
      .catch(error => {
        setGeneratedImages(prev => ({
          ...prev,
          [style.name]: { url: null, error: error.message || 'Gagal membuat gambar.', loading: false }
        }));
        return { status: 'rejected' };
      })
    );

    await Promise.allSettled(generationPromises);
    setAppState(AppState.COMPLETE);

  }, [originalImage, appState, analysisResult]);

  const handleCameraCapture = (file: File) => {
    setShowCamera(false);
    processFile(file);
  };

  const renderPreAnalysisView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left Column: Input & Original Image */}
      <div className="flex flex-col items-center justify-center space-y-6">
        <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 relative overflow-hidden">
          {originalImage ? (
            <img src={originalImage.url} alt="User selfie" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-gray-500 p-4">
              <SparklesIcon className="w-16 h-16 mx-auto text-gray-300 mb-2"/>
              <p>Foto Anda akan muncul di sini</p>
            </div>
          )}
        </div>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        
        <div className="w-full flex flex-col sm:flex-row gap-3">
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-pink-500 text-white font-semibold rounded-lg shadow-md hover:bg-pink-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:scale-100">
                <UploadIcon/> Unggah Foto
            </button>
            <button onClick={() => setShowCamera(true)} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:scale-100">
                <CameraIcon/> Ambil Selfie
            </button>
        </div>
        
        {appState === AppState.IMAGE_UPLOADED && (
          <button onClick={handleAnalyzeClick} className="w-full px-6 py-4 bg-green-500 text-white font-bold rounded-lg shadow-lg hover:bg-green-600 transition-transform transform hover:scale-105 text-lg">
            ✨ Temukan Gaya Rambut Sempurna Saya
          </button>
        )}

        {appState !== AppState.INITIAL && (
          <button onClick={handleReset} className="inline-flex items-center justify-center gap-2 text-gray-500 hover:text-gray-800 transition">
            <ResetIcon className="w-5 h-5" /> Mulai Lagi
          </button>
        )}
      </div>

      {/* Right Column: Results */}
      <div className="flex flex-col justify-center items-center">
        {appState !== AppState.ANALYZING && appState !== AppState.ERROR && (
          <div className="text-center p-8 bg-gray-50 rounded-lg w-full">
              <h3 className="text-xl font-semibold text-gray-700">Cara Kerjanya</h3>
              <ol className="mt-4 text-left space-y-2 text-gray-600 list-decimal list-inside">
                  <li>Unggah atau ambil foto selfie yang jelas dari depan.</li>
                  <li>AI kami akan menganalisis bentuk wajah unik Anda.</li>
                  <li>Dapatkan rekomendasi gaya rambut yang dipersonalisasi.</li>
                  <li>Pilih tingkat potongan dan lihat semua hasilnya sekaligus!</li>
              </ol>
          </div>
        )}

        {appState === AppState.ANALYZING && <Spinner message="Menganalisis bentuk wajah..."/>}
        
        {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md w-full" role="alert">
            <p className="font-bold">Ups!</p>
            <p>{error}</p>
            </div>
        )}
      </div>
    </div>
  );

  const renderPostAnalysisView = () => (
    <div className="text-center">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">
        Analisis Selesai!
      </h2>
      <p className="text-lg text-gray-600 mb-6">
        Bentuk wajah Anda adalah <span className="font-semibold text-pink-500">{analysisResult?.faceShape}</span>.
      </p>
       <div className="max-w-md mx-auto mb-8">
            <h3 className="text-xl font-semibold text-gray-700 mb-3 text-center">Foto Asli Anda</h3>
            <div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden shadow-md border">
              {originalImage && <img src={originalImage.url} alt="Original selfie" className="w-full h-full object-cover" />}
            </div>
       </div>

      {/* Haircut Preference */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-2xl font-semibold text-gray-800 mb-4">1. Pilih Tingkat Potongan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {haircutPreferences.map((pref) => (
                <button
                    key={pref.value}
                    onClick={() => handlePreferenceSelect(pref.value)}
                    disabled={appState === AppState.GENERATING}
                    className={`p-4 rounded-lg transition-all duration-200 border-2 font-semibold ${haircutPreference === pref.value ? 'border-pink-500 bg-pink-50 shadow-lg scale-105' : 'border-gray-200 bg-white hover:border-pink-300 hover:bg-pink-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {pref.label}
                </button>
            ))}
        </div>
      </div>

      {/* Recommendations */}
      {haircutPreference && (
        <div className="mb-8">
            <h3 className='text-2xl font-semibold text-gray-800 mb-4'>2. Hasil Gaya Rambut</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
                {analysisResult?.hairstyles.map((style) => {
                    const result = generatedImages[style.name];
                    const preferenceLabel = haircutPreferences.find(p => p.value === haircutPreference)?.label || haircutPreference;
                    return (
                        <div key={style.name} className="flex flex-col p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                            <div className="w-full aspect-square bg-gray-100 rounded-md overflow-hidden flex items-center justify-center mb-3">
                                {result?.loading && <Spinner message="Membuat..."/>}
                                {result?.error && (
                                    <div className="bg-red-100 text-red-700 p-2 text-xs rounded-md w-full h-full flex flex-col justify-center" role="alert">
                                        <p className="font-bold">Gagal</p>
                                        <p>{result.error}</p>
                                    </div>
                                )}
                                {result?.url && <img src={result.url} alt={`Generated: ${style.name}`} className="w-full h-full object-cover"/>}
                            </div>
                            <p className="font-bold text-gray-800">{style.name}</p>
                            <p className="text-sm font-semibold text-pink-500 mb-1">{preferenceLabel}</p>
                            <p className="text-sm text-gray-600 mt-1 flex-grow">{style.description}</p>
                        </div>
                    );
                })}
            </div>
        </div>
      )}


      <button onClick={handleReset} className="mt-4 inline-flex items-center justify-center gap-2 px-8 py-3 bg-gray-600 text-white font-bold rounded-lg shadow-lg hover:bg-gray-700 transition-transform transform hover:scale-105 text-lg">
          <ResetIcon className="w-5 h-5" /> Mulai Lagi
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      {showCamera && <CameraCapture onCapture={handleCameraCapture} onCancel={() => setShowCamera(false)} />}
      <header className="w-full max-w-5xl mx-auto text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 tracking-tight">
          Gaya Rambut Virtual <span className="text-pink-500">AI</span>
        </h1>
        <p className="mt-3 text-lg text-gray-600">
          Temukan tampilan sempurna Anda. Unggah foto selfie dan biarkan AI melakukan keajaibannya!
        </p>
      </header>
      
      <main className="w-full max-w-5xl bg-white rounded-2xl shadow-xl p-6 md:p-8">
        {analysisResult ? renderPostAnalysisView() : renderPreAnalysisView()}
      </main>
    </div>
  );
}