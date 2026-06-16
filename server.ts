import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Cargar archivo .env localmente si existe de forma nativa sin dependencias
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    envConfig.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        // Eliminar comillas simples o dobles alrededor del valor si las tiene
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value.trim();
      }
    });
  }
} catch (error) {
  console.error("No se pudo cargar el archivo .env:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // API routes
  app.post("/api/generate-content", async (req, res) => {
    try {
      const { prompt } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      
      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      const { model, contents, config } = req.body;
      
      const result = await ai.models.generateContent({
        model: model || 'gemini-3.5-flash',
        contents,
        config
      });

      const firstCandidate = result.candidates?.[0];
      const firstPart = firstCandidate?.content?.parts?.[0];
      
      if (firstPart?.inlineData) {
        res.json({ inlineData: firstPart.inlineData });
      } else {
        res.json({ text: result.text });
      }
    } catch (error) {
      console.error("AI API Error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Freesound Search Proxy Endpoint
  app.get("/api/freesound-search", async (req, res) => {
    try {
      const { query, customToken } = req.query;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Query parameter is required" });
        return;
      }
      // If user provided a custom token in their settings, use it. Else fall back.
      const token = (typeof customToken === "string" && customToken.trim() !== "")
        ? customToken
        : (process.env.FREESOUND_API_KEY || '0rXaeUju5Q1wEJOviVPogf3bqo4gkNlsjgZG0CwR');
        
      const fields = 'id,name,previews,duration,username,tags';
      const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&token=${token}&fields=${fields}&format=json&_=${Date.now()}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Token ${token}`,
          'User-Agent': 'TeatroDeLaAbadiaSoundboard/2.0 (Contact: Sonoterapia.1@gmail.com)'
        }
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`Freesound API error ${response.status}:`, responseText);
        res.status(response.status).send(responseText);
        return;
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.send(responseText);
    } catch (error) {
      console.error("Freesound search error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Pixabay Search Proxy Endpoint
  app.get("/api/pixabay-search", async (req, res) => {
    try {
      const { query, userKey } = req.query;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Query parameter is required" });
        return;
      }
      
      const apiKey = (typeof userKey === "string" && userKey.trim() !== "")
        ? userKey
        : (process.env.PIXABAY_API_KEY || "");
        
      if (!apiKey) {
        res.status(400).json({ error: "La API key de Pixabay es requerida. Por favor, configúrala en los Ajustes." });
        return;
      }

      // Query Pixabay music api
      const url = `https://pixabay.com/api/music/?key=${apiKey}&q=${encodeURIComponent(query)}&_=${Date.now()}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'TeatroDeLaAbadiaSoundboard/2.0 (Contact: Sonoterapia.1@gmail.com)'
        }
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`Pixabay API error ${response.status}:`, responseText);
        res.status(response.status).send(responseText);
        return;
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.send(responseText);
    } catch (error) {
      console.error("Pixabay search error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Openverse Search Proxy Endpoint
  app.get("/api/openverse-search", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Query parameter is required" });
        return;
      }
      
      const url = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'TeatroDeLaAbadiaSoundboard/2.0 (Contact: Sonoterapia.1@gmail.com)'
        }
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`Openverse API error ${response.status}:`, responseText);
        res.status(response.status).send(responseText);
        return;
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.send(responseText);
    } catch (error) {
      console.error("Openverse search error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Internet Pages Sound Search (Google Grounded Search via Gemini)
  app.get("/api/internet-pages-search", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Query parameter is required" });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Construct an optimized search prompt for finding reproducible audio hotlinks
      const searchQuery = `Find public web pages hosting downloadable or streaming audio files (.mp3, .wav, .ogg) matching: "${query}". 
Using the googleSearch tool, explore sites like SoundBible, OrangeFreeSounds, Soundjay, FreeSFX, or similar free audio archives. 
Recover up to 10 direct playable URL links to the files. Ensure every previewUrl is a real, direct link to an audio file (typically ending in .mp3, .wav, or .ogg) that can be loaded in an HTML <audio src="..."> tag. 
Translate the names to short, beautiful Spanish descriptions.`;

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: searchQuery,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              results: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Nombre descriptivo corto del sonido en español (ej: 'Mullido maullido de gato')" },
                    previewUrl: { type: Type.STRING, description: "Enlace directo, absoluto de descarga o streaming del archivo de audio (ej: .mp3, .wav)" },
                    duration: { type: Type.NUMBER, description: "Duración aproximada del audio en segundos, usa 0 si no se conoce" },
                    username: { type: Type.STRING, description: "Nombre o dominio de la página web de procedencia (ej: 'SoundBible', 'OrangeFreeSounds')" }
                  },
                  required: ["name", "previewUrl", "username"]
                }
              }
            },
            required: ["results"]
          }
        }
      });

      const responseText = result.text || "{}";
      const data = JSON.parse(responseText.trim());
      res.json(data);
    } catch (error) {
      console.error("Internet pages sound search error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Global Audio/File Proxy Endpoint
  app.get("/api/proxy", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL parameter is required" });
        return;
      }
      
      const targetUrl = decodeURIComponent(url);
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'TeatroDeLaAbadiaSoundboard/2.0 (Contact: Sonoterapia.1@gmail.com)'
        }
      });
      
      if (!response.ok) {
        res.status(response.status).send(`Failed to fetch from proxy target: ${response.statusText}`);
        return;
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("content-type", contentType);
      }
      
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*any', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
