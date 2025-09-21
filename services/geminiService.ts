import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, HaircutPreference } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

export const analyzeFaceShape = async (imageBase64: string, mimeType: string): Promise<AnalysisResult> => {
    const imagePart = fileToGenerativePart(imageBase64, mimeType);
    
    const prompt = `Analisis bentuk wajah pada gambar ini (misalnya, Oval, Bulat, Kotak, Hati, Berlian). Selain itu, tentukan panjang rambut saat ini (misalnya, "Pendek", "Sebahu", "Panjang"). Berdasarkan bentuk yang teridentifikasi, rekomendasikan 3 gaya rambut yang berbeda dan cocok dengan deskripsi singkat satu kalimat untuk masing-masing. Berikan respons secara ketat dalam format JSON yang ditentukan.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        faceShape: {
                            type: Type.STRING,
                            description: "Bentuk wajah yang teridentifikasi, mis., Oval, Bulat, Kotak, Hati, atau Berlian.",
                        },
                        originalHairLength: {
                            type: Type.STRING,
                            description: "Panjang rambut yang teridentifikasi dalam gambar, mis., Pendek, Sebahu, atau Panjang."
                        },
                        hairstyles: {
                            type: Type.ARRAY,
                            description: "Sebuah array berisi rekomendasi gaya rambut.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: {
                                        type: Type.STRING,
                                        description: "Nama gaya rambut.",
                                    },
                                    description: {
                                        type: Type.STRING,
                                        description: "Deskripsi singkat satu kalimat mengapa gaya rambut ini cocok.",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const jsonString = response.text;
        
        if (!jsonString || jsonString.trim() === "" || jsonString.trim().toLowerCase() === "null") {
            throw new Error("AI mengembalikan respons kosong. Coba foto lain.");
        }
        
        const result: AnalysisResult = JSON.parse(jsonString);

        if (!result || typeof result !== 'object' || !result.faceShape || !result.hairstyles) {
            console.error("Invalid JSON structure received from AI:", result);
            throw new Error("AI mengembalikan data dalam format yang tidak terduga. Silakan coba lagi.");
        }

        return result;

    } catch (error) {
        console.error("Error analyzing face shape:", error);
        if (error instanceof Error && error.message.includes("AI mengembalikan")) {
            throw error;
        }
        throw new Error("Gagal menganalisis gambar. Silakan coba foto lain.");
    }
};

export const generateHairstyleImage = async (imageBase64: string, mimeType: string, hairstyleName: string, originalHairLength: string, haircutPreference: HaircutPreference): Promise<{imageUrl: string, text: string}> => {
    const imagePart = fileToGenerativePart(imageBase64, mimeType);
    
    const preferenceDefinitions = {
        "Rapikan": "Hanya trim ringan. Buat rambut terlihat lebih rapi dan sehat, hilangkan ujung bercabang, tetapi pertahankan panjang umum yang sama atau sedikit lebih pendek.",
        "Sedang": "Potongan sedang yang terlihat. Kurangi panjang rambut secara signifikan, tetapi jangan membuatnya menjadi potongan yang sangat pendek. Perubahannya harus jelas.",
        "Pendek": "Transformasi besar menjadi potongan pendek. Ubah gaya rambut menjadi versi yang jauh lebih pendek dari aslinya (misalnya, dari panjang menjadi bob, atau dari sebahu menjadi pixie)."
    };

    const prompt = `Anda adalah seorang penata rambut virtual ahli yang berspesialisasi dalam simulasi potong rambut. Tugas Anda adalah menunjukkan bagaimana penampilan seseorang dengan gaya rambut BARU berdasarkan preferensi potongan mereka.

**INPUT:**
1.  **Gaya yang Diminta:** '${hairstyleName}'
2.  **Panjang Rambut Asli:** '${originalHairLength}'
3.  **Tingkat Potongan yang Diinginkan:** '${haircutPreference}'

**DEFINISI TINGKAT POTONGAN:**
*   **Rapikan:** ${preferenceDefinitions["Rapikan"]}
*   **Sedang:** ${preferenceDefinitions["Sedang"]}
*   **Pendek:** ${preferenceDefinitions["Pendek"]}

**ATURAN KRITIS ANDA:**
1.  **PATUHI TINGKAT POTONGAN:** Prioritas utama Anda adalah menerapkan tingkat potongan '${haircutPreference}'. Hasil akhir HARUS secara akurat mencerminkan definisi di atas.
2.  **SESUAIKAN GAYA:** Terapkan gaya '${hairstyleName}', tetapi modifikasi agar sesuai dengan aturan #1. Misalnya, jika gaya yang diminta adalah 'Layer Panjang' tetapi tingkat potongannya adalah 'Pendek', Anda harus membuat 'Bob Berlayer' atau gaya pendek lain yang terinspirasi dari permintaan asli.
3.  **HANYA UBAH RAMBUT:** Jaga agar wajah, ekspresi, pakaian, latar belakang, dan pencahayaan tetap SAMA PERSIS dengan gambar asli.
4.  **REALISTIS:** Hasilnya harus terlihat seperti foto asli yang diedit, bukan gambar buatan AI.`;

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    imagePart,
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        if (response.promptFeedback?.blockReason) {
            console.error('Request was blocked:', response.promptFeedback.blockReason);
            throw new Error(`Gagal membuat gambar karena permintaan diblokir: ${response.promptFeedback.blockReason}. Coba gaya atau foto lain.`);
        }
        
        let generatedImageUrl = '';
        let generatedText = "Ini dia tampilan baru Anda!";

        if (response.candidates && response.candidates.length > 0) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64ImageBytes: string = part.inlineData.data;
                    generatedImageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
                } else if (part.text) {
                    generatedText = part.text;
                }
            }
        }
        
        if (!generatedImageUrl) {
            throw new Error("AI tidak dapat menghasilkan gambar untuk gaya rambut ini. Silakan coba yang lain.");
        }
        
        return { imageUrl: generatedImageUrl, text: generatedText };

    } catch (error) {
        console.error("Error generating hairstyle image:", error);
        if (error instanceof Error) {
            throw error; // Re-throw the more specific error
        }
        throw new Error("Gagal menghasilkan gaya rambut baru. Silakan coba lagi atau pilih gaya yang berbeda.");
    }
};