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
        "Sedang": "Potongan sedang yang terlihat. Kurangi panjang rambut secara signifikan, tetapi jangan membuatnya menjadi potongan yang sangat pendek. Perubahannya harus jelas dan nyata.",
        "Pendek": "Transformasi besar menjadi potongan pendek. Ubah gaya rambut menjadi versi yang jauh lebih pendek dari aslinya (misalnya, dari panjang menjadi bob, atau dari sebahu menjadi pixie).",
        "Super Pendek": "Transformasi ekstrem menjadi potongan yang sangat pendek dan berani. Ini adalah opsi terpendek. Pikirkan potongan pixie, undercut, atau bob yang sangat pendek, terlepas dari panjang aslinya. Perubahannya harus sangat dramatis."
    };

    const prompt = `Anda adalah editor foto ahli dengan satu tugas spesifik: memodifikasi rambut seseorang dalam foto agar lebih pendek, sesuai dengan tingkat potongan yang diminta.

**PERINTAH UTAMA (TIDAK BISA DITAWAR):**
Anda HARUS mengubah rambut di foto agar secara visual cocok dengan deskripsi tingkat potongan ini:
- **Tingkat Potongan:** '${haircutPreference}'
- **Definisi:** '${preferenceDefinitions[haircutPreference]}'
Ini adalah tujuan utama Anda. Panjang rambut di hasil akhir WAJIB sesuai dengan definisi ini.

**INSPIRASI GAYA (SEKUNDER):**
Setelah Anda memastikan panjangnya benar, gunakan nama gaya rambut berikut sebagai INSPIRASI untuk tekstur dan bentuk potongan:
- **Inspirasi Gaya:** '${hairstyleName}'

**CONTOH LOGIKA & ATURAN TEGAS:**
- JIKA Tingkat Potongan adalah 'Pendek' DAN Inspirasi adalah 'Gelombang Pantai Panjang', maka hasil Anda HARUS berupa gaya rambut PENDEK (seperti bob atau pixie) yang memiliki tekstur bergelombang. JANGAN membuat rambut panjang.
- JIKA Tingkat Potongan adalah 'Sedang' DAN Inspirasi adalah 'Potongan Pixie', dan rambut asli sudah pendek, maka Anda harus memotongnya sedikit lebih pendek lagi sesuai definisi 'Sedang'. JANGAN memanjangkannya.
- Prioritaskan selalu Tingkat Potongan di atas Inspirasi Gaya.

**LARANGAN:**
- JANGAN mengubah apa pun selain rambut (wajah, ekspresi, pakaian, latar belakang, pencahayaan harus identik).
- JANGAN mengabaikan 'Tingkat Potongan'. Ini adalah kegagalan tugas.
- JANGAN membuat hasil yang terlihat seperti gambar AI; harus fotorealistis.

Terapkan perubahan ini sekarang pada gambar yang diberikan.`;

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