import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { currentData, prompt } = body;

    const customGoogleKey = currentData?.settings?.googleApiKey?.trim();
    const serverGoogleKey = process.env.GEMINI_API_KEY?.trim();
    const openaiKey = currentData?.settings?.openaiApiKey?.trim();

    const effectiveGoogleKey = customGoogleKey || serverGoogleKey;

    if (!effectiveGoogleKey && !openaiKey) {
      return NextResponse.json(
        { error: "Nenhuma chave de API encontrada. Vá em 'Configurações' no aplicativo e insira sua Google API Key (formato AIzaSy...)." },
        { status: 400 }
      );
    }

    let responseText = "";

    if (effectiveGoogleKey) {
      // Use Google Gemini API
      const ai = new GoogleGenAI({ apiKey: effectiveGoogleKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              en: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  intro: { type: Type.STRING },
                  warning: { type: Type.STRING },
                  windows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        systems: { type: Type.STRING },
                        text: { type: Type.STRING }
                      }
                    }
                  }
                }
              },
              zh: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  intro: { type: Type.STRING },
                  warning: { type: Type.STRING },
                  windows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        systems: { type: Type.STRING },
                        text: { type: Type.STRING }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      responseText = response.text || "";
    } else if (openaiKey) {
      // Fallback to OpenAI ChatGPT
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant that translates IT maintenance memos." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      responseText = completion.choices[0].message.content || "";
    }

    if (!responseText) {
      return NextResponse.json({ error: "Resposta vazia da IA." }, { status: 500 });
    }

    const jsonResult = JSON.parse(responseText);
    return NextResponse.json(jsonResult);
  } catch (error: any) {
    console.error("Translation error in API route:", error);
    let errorMsg = error?.message || "Erro interno no servidor de tradução.";
    
    if (errorMsg.includes("API key not valid") || errorMsg.includes("INVALID_ARGUMENT") || errorMsg.includes("API_KEY_INVALID")) {
      errorMsg = "A chave de API do Google é inválida. Certifique-se de usar uma chave do Google AI Studio (formato iniciado por 'AIzaSy...').";
    }

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
