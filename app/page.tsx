'use client';

import { GoogleGenAI, Type } from "@google/genai";
import Image from 'next/image';
import * as htmlToImage from 'html-to-image';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Plus, 
  Edit3, 
  History, 
  FileText, 
  Settings, 
  HelpCircle, 
  Calendar, 
  Clock, 
  Info, 
  RotateCcw, 
  Copy, 
  Image as ImageIcon, 
  Sparkles,
  Check,
  ChevronRight,
  X,
  Trash2,
  Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
type System = 'Protheus' | 'Fluig' | 'SGBOM' | 'Greendocs' | 'Projuris';
type Section = 'editor' | 'templates' | 'history' | 'settings';

interface MaintenanceWindow {
  id: string;
  systems: System[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

interface TranslatedContent {
  en: {
    title: string;
    intro: string;
    warning: string;
    windows: { systems: string; text: string }[];
  };
  zh: {
    title: string;
    intro: string;
    warning: string;
    windows: { systems: string; text: string }[];
  };
}

interface MemoSettings {
  department: string;
  manager: string;
  footerLine2: string;
  headerImage?: string;
  footerImage?: string;
  openaiApiKey?: string;
  customPrompt?: string;
}

interface MemoData {
  windows: MaintenanceWindow[];
  settings: MemoSettings;
  customIntro?: string;
  customTitlePt?: string;
}

interface Template {
  id: string;
  title: string;
  description: string;
  iconType: string;
  data: {
    windows: MaintenanceWindow[];
    customIntro?: string;
    customTitlePt?: string;
  };
}

interface HistoryItem {
  id: string;
  timestamp: number;
  data: MemoData;
}

const DEFAULT_PROMPT = `Translate the following IT maintenance memo content into English (en) and Simplified Chinese (zh-CN).

Instructions for Windows:
- Use a descriptive sentence format.
- If Start Date and End Date are the same, format like: "March 29, 2026 (Sunday) starting at 08:00h with an estimated completion by 12:00h."
- If they are different, format like: "Starting on March 29 (Sunday) at 22:00h with an estimated completion on March 30 (Monday) at 04:00h."
- Translate these formats appropriately for English and Chinese.

Return the translations in a JSON format matching this schema:
{
  "en": { "title": "string", "intro": "string", "warning": "string", "windows": [{ "systems": "string", "text": "string" }] },
  "zh": { "title": "string", "intro": "string", "warning": "string", "windows": [{ "systems": "string", "text": "string" }] }
}`;

const INITIAL_WINDOW: MaintenanceWindow = {
  id: '1',
  systems: ['Greendocs'],
  startDate: '2026-01-02',
  endDate: '2026-01-03',
  startTime: '23:00',
  endTime: '01:00',
};

const INITIAL_DATA: MemoData = {
  windows: [INITIAL_WINDOW],
  settings: {
    department: 'Departamento de TI',
    manager: 'Gestão de Infraestrutura e Redes',
    footerLine2: 'Suporte Técnico Especializado',
    headerImage: '',
    footerImage: '',
    customPrompt: DEFAULT_PROMPT
  },
  customIntro: 'Informamos que realizaremos uma manutenção técnica essencial para garantir a estabilidade e performance de nossa infraestrutura digital.',
  customTitlePt: 'Parada Programada'
};

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'emergency',
    title: 'Manutenção Emergencial',
    description: 'Para correções críticas imediatas que não podem aguardar a janela padrão.',
    iconType: 'sparkles',
    data: {
      customIntro: 'Informamos que realizaremos uma manutenção emergencial crítica para corrigir falhas que impactam a operação imediata.',
      windows: [{
        id: 'temp-1',
        systems: ['Protheus', 'Fluig'],
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        startTime: '18:00',
        endTime: '20:00',
      }]
    }
  },
  {
    id: 'infra',
    title: 'Infraestrutura de Rede',
    description: 'Atualização de switches, roteadores e servidores de arquivos.',
    iconType: 'settings',
    data: {
      customIntro: 'Informamos que realizaremos atualizações em nossa infraestrutura de rede para melhorar a conectividade e segurança dos dados.',
      windows: [{
        id: 'temp-1',
        systems: ['Greendocs', 'SGBOM'],
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        startTime: '22:00',
        endTime: '04:00',
      }]
    }
  },
  {
    id: 'erp-update',
    title: 'Atualização de ERP',
    description: 'Janela longa para virada de versão ou aplicação de patches pesados.',
    iconType: 'file',
    data: {
      customIntro: 'Informamos que o sistema ERP passará por uma atualização de versão programada para implementação de novas funcionalidades e correções.',
      windows: [{
        id: 'temp-1',
        systems: ['Protheus'],
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        startTime: '20:00',
        endTime: '08:00',
      }]
    }
  }
];

const ICON_MAP: Record<string, React.ReactNode> = {
  sparkles: <Sparkles size={20} />,
  settings: <Settings size={20} />,
  file: <FileText size={20} />,
  rotate: <RotateCcw size={20} />,
  check: <Check size={20} />,
  calendar: <Calendar size={20} />,
  info: <Info size={20} />,
  plus: <Plus size={20} />
};

const getDayOfWeek = (dateStr: string) => {
  if (!dateStr) return '';
  // Use a fixed time to avoid timezone shifts
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^\w/, (c) => c.toUpperCase());
};

const formatDateLong = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  const formatted = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  // Capitalize month name for a more formal look: "29 de março" -> "29 de Março"
  return formatted.replace(/de (\w)/g, (match, p1) => `de ${p1.toUpperCase()}`);
};

const formatWindowFullTextPt = (window: MaintenanceWindow) => {
  const startDay = getDayOfWeek(window.startDate);
  const startDate = formatDateLong(window.startDate);
  
  if (window.startDate === window.endDate || !window.endDate) {
    return `${startDate} (${startDay}) iniciando às ${window.startTime}h com previsão de término para às ${window.endTime}h.`;
  } else {
    const endDay = getDayOfWeek(window.endDate);
    const endDate = formatDateLong(window.endDate);
    return `Iniciando em ${startDate} (${startDay}) às ${window.startTime}h com previsão de término para ${endDate} (${endDay}) às ${window.endTime}h.`;
  }
};

const formatWindowDateRange = (startDate: string, endDate: string) => {
  if (!startDate) return '';
  if (!endDate || startDate === endDate) {
    const dayOfWeek = getDayOfWeek(startDate);
    const fullDate = formatDateLong(startDate);
    return `${dayOfWeek}, ${fullDate}`;
  }
  
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  
  if (startYear !== endYear) {
    const startDayOfWeek = getDayOfWeek(startDate);
    const startFull = start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const endDayOfWeek = getDayOfWeek(endDate);
    const endFull = end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    return `De ${startDayOfWeek}, ${startFull} a ${endDayOfWeek}, ${endFull}`;
  }
  
  const startDayOfWeek = getDayOfWeek(startDate);
  const startDay = start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  const endDayOfWeek = getDayOfWeek(endDate);
  const endFull = end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  
  return `De ${startDayOfWeek}, ${startDay} a ${endDayOfWeek}, ${endFull}`;
};

export default function ITMemoGenerator() {
  const [data, setData] = useState<MemoData>(INITIAL_DATA);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('editor');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [translations, setTranslations] = useState<TranslatedContent | null>(null);
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [isUploadingHeader, setIsUploadingHeader] = useState(false);
  const [isUploadingFooter, setIsUploadingFooter] = useState(false);
  const lastTranslatedDataRef = useRef<string>('');
  const previewRef = useRef<HTMLDivElement>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    // Load history
    const savedHistory = localStorage.getItem('it-memo-history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }

    // Load settings
    const savedSettings = localStorage.getItem('it-memo-settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        if (settings && typeof settings === 'object') {
          setData(prev => ({ ...prev, settings: { ...prev.settings, ...settings } }));
        }
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }

    // Load templates
    const savedTemplates = localStorage.getItem('it-memo-templates');
    if (savedTemplates) {
      try {
        const parsed = JSON.parse(savedTemplates);
        if (Array.isArray(parsed)) {
          setTemplates(parsed);
        }
      } catch (e) {
        console.error('Failed to parse templates', e);
      }
    }

    // Load auto-translate preference
    const savedAutoTranslate = localStorage.getItem('it-memo-auto-translate');
    if (savedAutoTranslate !== null) {
      setAutoTranslate(savedAutoTranslate === 'true');
    }
  }, []);

  const compressImage = (dataUrl: string, maxWidth: number = 1200): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(dataUrl); // Fallback to original if error
    });
  };

  const saveToHistory = (memoData: MemoData) => {
    try {
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substring(2, 11),
        timestamp: Date.now(),
        data: JSON.parse(JSON.stringify(memoData))
      };
      
      // Reduce history size to 10 to save space
      let updatedHistory = [newItem, ...history].slice(0, 10);
      
      const trySave = (items: HistoryItem[]): boolean => {
        try {
          localStorage.setItem('it-memo-history', JSON.stringify(items));
          setHistory(items);
          return true;
        } catch (e) {
          if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            if (items.length > 1) {
              // Prune oldest item and try again
              return trySave(items.slice(0, -1));
            }
          }
          throw e;
        }
      };

      trySave(updatedHistory);
    } catch (e) {
      console.error('Failed to save to history', e);
    }
  };

  const deleteHistoryItem = (id: string) => {
    try {
      const updatedHistory = history.filter(item => item.id !== id);
      setHistory(updatedHistory);
      localStorage.setItem('it-memo-history', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error('Failed to delete history item', e);
    }
  };

  const applyHistoryItem = (item: HistoryItem) => {
    if (item && item.data) {
      setData(item.data);
      setActiveTemplate(null);
      setActiveSection('editor');
      showToast('Histórico aplicado com sucesso!');
    }
  };

  const applyTemplate = (template: Template) => {
    if (template && template.data) {
      setData(prev => ({
        ...prev,
        customIntro: template.data.customIntro || INITIAL_DATA.customIntro,
        customTitlePt: template.data.customTitlePt || INITIAL_DATA.customTitlePt,
        windows: (template.data.windows || []).map((w: any) => ({ 
          ...w, 
          id: Math.random().toString(36).substring(2, 11),
          systems: Array.isArray(w.systems) ? w.systems : []
        }))
      }));
      setActiveTemplate(template);
      setActiveSection('editor');
      showToast('Modelo aplicado com sucesso!');
    }
  };

  const saveTemplates = (updatedTemplates: Template[]) => {
    try {
      setTemplates(updatedTemplates);
      localStorage.setItem('it-memo-templates', JSON.stringify(updatedTemplates));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        showToast('Espaço de armazenamento cheio. Tente excluir itens do histórico.', 'error');
      } else {
        console.error('Failed to save templates', e);
        showToast('Erro ao salvar modelos.', 'error');
      }
    }
  };

  const handleSaveTemplate = (templateData: Omit<Template, 'id'> & { id?: string }) => {
    let updated;
    if (templateData.id) {
      updated = templates.map(t => t.id === templateData.id ? (templateData as Template) : t);
    } else {
      const newTemplate: Template = {
        ...templateData,
        id: Math.random().toString(36).substring(2, 11)
      } as Template;
      updated = [...templates, newTemplate];
    }
    saveTemplates(updated);
    setIsTemplateModalOpen(false);
    setEditingTemplate(null);
    showToast('Modelo salvo com sucesso!');
  };

  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    saveTemplates(updated);
    setTemplateToDelete(null);
    showToast('Modelo excluído.');
  };

  const updateSettings = (updates: Partial<MemoSettings>) => {
    setData(prev => {
      const newSettings = { ...prev.settings, ...updates };
      try {
        localStorage.setItem('it-memo-settings', JSON.stringify(newSettings));
      } catch (e) {
        console.error('Failed to save settings', e);
      }
      return {
        ...prev,
        settings: newSettings
      };
    });
  };

  const addWindow = () => {
    const newWindow: MaintenanceWindow = {
      id: Math.random().toString(36).substr(2, 9),
      systems: [],
      startDate: '',
      endDate: '',
      startTime: '',
      endTime: '',
    };
    setData(prev => ({ ...prev, windows: [...prev.windows, newWindow] }));
  };

  const removeWindow = (id: string) => {
    if (data.windows.length <= 1) return;
    setData(prev => ({ ...prev, windows: prev.windows.filter(w => w.id !== id) }));
  };

  const updateWindow = (id: string, updates: Partial<MaintenanceWindow>) => {
    setData(prev => ({
      ...prev,
      windows: prev.windows.map(w => w.id === id ? { ...w, ...updates } : w)
    }));
  };

  const toggleSystem = (windowId: string, system: System) => {
    setData(prev => ({
      ...prev,
      windows: prev.windows.map(w => {
        if (w.id !== windowId) return w;
        return {
          ...w,
          systems: w.systems.includes(system)
            ? w.systems.filter(s => s !== system)
            : [...w.systems, system]
        };
      })
    }));
  };

  const handleReset = () => {
    setData(INITIAL_DATA);
    setActiveTemplate(null);
  };

  const dataRef = useRef(data);
  const autoTranslateRef = useRef(autoTranslate);
  const isTranslatingRef = useRef(isTranslating);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { autoTranslateRef.current = autoTranslate; }, [autoTranslate]);
  useEffect(() => { isTranslatingRef.current = isTranslating; }, [isTranslating]);

  const handleGenerateTranslations = useCallback(async (retryCount = 0, force = false) => {
    const currentData = dataRef.current;
    if (currentData.windows.every(w => w.systems.length === 0)) return;
    if (!autoTranslateRef.current && !force) return;
    
    // Create a unique key for the current content to avoid redundant calls
    const currentDataKey = JSON.stringify({
      windows: currentData.windows,
      customIntro: currentData.customIntro || INITIAL_DATA.customIntro,
      customTitlePt: currentData.customTitlePt || INITIAL_DATA.customTitlePt,
      customPrompt: currentData.settings.customPrompt,
      openaiApiKey: currentData.settings.openaiApiKey
    });
    
    if (currentDataKey === lastTranslatedDataRef.current && !force) return;
    if (isTranslatingRef.current && retryCount === 0) return;
    
    const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const openaiKey = currentData.settings.openaiApiKey;
    
    if (!geminiKey && !openaiKey) {
      console.warn("AI API key is missing. Translation skipped.");
      if (force) showToast("Chave de API não configurada. Verifique as configurações.", "error");
      return;
    }

    setIsTranslating(true);
    try {
      const prompt = `
        ${currentData.settings.customPrompt || DEFAULT_PROMPT}

        Data to translate:
        Title: "${currentData.customTitlePt || INITIAL_DATA.customTitlePt}"
        Intro: "${currentData.customIntro || INITIAL_DATA.customIntro}"
        Warning: "Durante este período, os serviços listados poderão apresentar instabilidade. Recomendamos salvar todos os trabalhos antes do início."
        
        Maintenance Windows:
        ${currentData.windows.map((w, i) => `
        Window ${i + 1}:
        Systems: ${(w.systems || []).join('/')}
        Start Date: ${w.startDate}
        End Date: ${w.endDate}
        Time: from ${w.startTime} to ${w.endTime}
        `).join('\n')}
      `;

      let responseText = "";

      if (openaiKey) {
        // Use ChatGPT
        const { OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful assistant that translates IT maintenance memos." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });
        responseText = completion.choices[0].message.content || "";
      } else {
        // Use Gemini
        const ai = new GoogleGenAI({ apiKey: geminiKey! });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
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
      }

      if (responseText) {
        // Clean up response text in case of markdown wrappers
        const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
        const result = JSON.parse(cleanedText);
        setTranslations(result);
        lastTranslatedDataRef.current = currentDataKey;
        if (force) showToast("Tradução concluída com sucesso!");
      }
    } catch (error: any) {
      console.error("Translation failed:", error);
      
      const errorMsg = error?.message || String(error);
      
      // Handle rate limit error (429) with exponential backoff
      if (errorMsg.includes('429') || error?.status === 'RESOURCE_EXHAUSTED') {
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
          console.log(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${retryCount + 1})`);
          setTimeout(() => handleGenerateTranslations(retryCount + 1), delay);
          return; // Don't set isTranslating to false yet
        }
        showToast("Limite de requisições atingido. Tente novamente em instantes.", "error");
      } else {
        showToast("Falha na tradução. Verifique sua conexão e chaves de API.", "error");
      }
    } finally {
      if (retryCount === 0 || retryCount >= 3) {
        setIsTranslating(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleGenerateTranslations();
    }, 1500);
    return () => clearTimeout(timer);
  }, [handleGenerateTranslations]);

  const toggleAutoTranslate = () => {
    const newValue = !autoTranslate;
    setAutoTranslate(newValue);
    localStorage.setItem('it-memo-auto-translate', String(newValue));
    if (newValue) {
      handleGenerateTranslations(0, true);
    }
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    saveToHistory(data);
    setTimeout(() => {
      setIsGenerating(false);
      // Optional: auto-download or show success
    }, 1500);
  };

  const handleCopyText = async () => {
    let text = `
COMUNICADO DE MANUTENÇÃO PROGRAMADA
-----------------------------------
Prezados colaboradores,

${data.customIntro || INITIAL_DATA.customIntro}

JANELAS DE MANUTENÇÃO:
${(data.windows || []).map(w => `
- SISTEMAS: ${(w.systems || []).join('/')}
  DATA: ${formatDateLong(w.startDate)} (${getDayOfWeek(w.startDate)})
  HORÁRIO: das ${w.startTime}h às ${w.endTime}h${w.startDate !== w.endDate ? ` do dia ${formatDateLong(w.endDate)}` : ''}
`).join('')}

Atenciosamente,
TI
`.trim();

    if (translations) {
      text += `

${translations.en.title}

Dear colleagues,
${translations.en.intro}

MAINTENANCE WINDOWS:
${Array.isArray(translations.en.windows) ? translations.en.windows.map(w => `
- SYSTEMS: ${w.systems}
  ${w.text}
`).join('') : ''}

${translations.zh.title}

各位同事：
${translations.zh.intro}

维护窗口：
${Array.isArray(translations.zh.windows) ? translations.zh.windows.map(w => `
- 系统: ${w.systems}
  ${w.text}
`).join('') : ''}
`;
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast('Texto copiado para a área de transferência!');
    } catch (err) {
      console.error('Falha ao copiar texto:', err);
      showToast('Erro ao copiar texto. Tente manualmente.', 'error');
    }
  };

  const handleDownloadImage = async () => {
    if (!previewRef.current) return;
    
    setIsGenerating(true);
    
    // Store original styles to restore later
    const originalWidth = previewRef.current.style.width;
    const originalHeight = previewRef.current.style.height;
    const originalMinHeight = previewRef.current.style.minHeight;
    const originalMaxHeight = previewRef.current.style.maxHeight;
    const originalPosition = previewRef.current.style.position;
    const originalOverflow = previewRef.current.style.overflow;
    const originalMargin = previewRef.current.style.margin;
    const originalPadding = previewRef.current.style.padding;
    const originalTransform = previewRef.current.style.transform;
    const originalBoxShadow = previewRef.current.style.boxShadow;
    const originalBorderRadius = previewRef.current.style.borderRadius;
    
    try {
      // 1. Prepare for high-quality capture
      const captureWidth = 1228; // 1180px content + 48px padding (24px each side)
      
      // Ensure the element is clean for capture
      previewRef.current.style.width = `${captureWidth}px`;
      previewRef.current.style.height = 'auto';
      previewRef.current.style.minHeight = 'unset';
      previewRef.current.style.maxHeight = 'unset';
      previewRef.current.style.overflow = 'visible';
      previewRef.current.style.margin = '0';
      previewRef.current.style.padding = '24px'; // Match the p-6 class (24px)
      previewRef.current.style.transform = 'none';
      previewRef.current.style.boxShadow = 'none';
      previewRef.current.style.borderRadius = '0';
      
      // 2. Wait for layout to settle and images to be ready
      // Increased delay to ensure all images and fonts are rendered
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 3. Measure the actual content height accurately
      // We use offsetHeight as it includes padding and borders
      const captureHeight = previewRef.current.offsetHeight;

      // 4. Generate the image with html-to-image
      const dataUrl = await htmlToImage.toPng(previewRef.current, {
        quality: 1,
        pixelRatio: 3, // Even higher resolution (3x)
        width: captureWidth,
        height: captureHeight,
        backgroundColor: '#ffffff',
        cacheBust: true,
        style: {
          transform: 'none',
          width: `${captureWidth}px`,
          height: `${captureHeight}px`,
          borderRadius: '0', 
          boxShadow: 'none',
          margin: '0',
          padding: '24px', 
          backdropFilter: 'none', 
        }
      });
      
      const link = document.createElement('a');
      link.download = `comunicado-ti-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Imagem baixada com sucesso!');
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
      showToast('Erro ao gerar imagem. Tente novamente.', 'error');
    } finally {
      // Restore original styles
      if (previewRef.current) {
        previewRef.current.style.width = originalWidth;
        previewRef.current.style.height = originalHeight;
        previewRef.current.style.minHeight = originalMinHeight;
        previewRef.current.style.maxHeight = originalMaxHeight;
        previewRef.current.style.position = originalPosition;
        previewRef.current.style.overflow = originalOverflow;
        previewRef.current.style.margin = originalMargin;
        previewRef.current.style.padding = originalPadding;
        previewRef.current.style.transform = originalTransform;
        previewRef.current.style.boxShadow = originalBoxShadow;
        previewRef.current.style.borderRadius = originalBorderRadius;
      }
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-outline-variant/20 bg-slate-50 shrink-0 transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/20 relative">
                <Image 
                  src="https://picsum.photos/seed/admin/100/100" 
                  alt="Profile" 
                  fill
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <p className="font-headline font-bold text-primary leading-tight">IT MEMO</p>
                <p className="text-[12px] text-on-surface-variant uppercase tracking-wider font-medium">Architect Suite</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant"
            >
              <X size={20} />
            </button>
          </div>
          
          <button 
            onClick={() => {
              handleReset();
              setIsSidebarOpen(false);
            }}
            className="w-full py-3 bg-gradient-to-br from-primary to-primary-container text-white font-headline font-bold text-[16px] rounded-lg shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Plus size={16} />
            Novo Comunicado
          </button>
        </div>

        <nav className="flex-1 px-2 space-y-1">
          <NavItem 
            icon={<Edit3 size={18} />} 
            label="Gerador" 
            active={activeSection === 'editor'} 
            onClick={() => {
              setActiveSection('editor');
              setIsSidebarOpen(false);
            }}
          />
          <NavItem 
            icon={<FileText size={18} />} 
            label="Modelos" 
            active={activeSection === 'templates'} 
            onClick={() => {
              setActiveSection('templates');
              setIsSidebarOpen(false);
            }}
          />
          <NavItem 
            icon={<History size={18} />} 
            label="Histórico" 
            active={activeSection === 'history'} 
            onClick={() => {
              setActiveSection('history');
              setIsSidebarOpen(false);
            }}
          />
          <NavItem 
            icon={<Settings size={18} />} 
            label="Configurações" 
            active={activeSection === 'settings'} 
            onClick={() => {
              setActiveSection('settings');
              setIsSidebarOpen(false);
            }}
          />
        </nav>

        <div className="p-6 border-t border-outline-variant/10">
          <p className="text-[13px] font-bold text-on-surface-variant/50 uppercase tracking-widest">© 2024 IT ARCHITECT</p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-18 border-b border-outline-variant/10 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant"
            >
              <Layout size={20} />
            </button>
            <span className="text-[22px] font-black text-primary tracking-tighter font-headline lg:hidden">IT MEMO</span>
            <div className="hidden lg:block h-6 w-px bg-outline-variant/30"></div>
            <h1 className="text-[18px] lg:text-[21px] font-bold font-headline text-on-surface tracking-tight truncate max-w-[200px] sm:max-w-none">
              Gerador de Comunicado
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button className="p-2 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant">
              <HelpCircle size={20} />
            </button>
            <button 
              onClick={() => setActiveSection('settings')}
              className="p-2 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Form Panel */}
          <section className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 bg-surface">
            <div className="max-w-xl mx-auto lg:mx-0">
              <AnimatePresence mode="wait">
                {activeSection === 'editor' && (
                  <motion.div
                    key="editor"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-10"
                  >
                    <header className="mb-10">
                      {activeTemplate && (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-[13px] font-bold uppercase tracking-wider mb-4 border border-primary/20">
                          <Layout size={20} />
                          Modelo Ativo: {activeTemplate.title}
                        </div>
                      )}
                      <h2 className="text-[31px] font-headline font-extrabold text-primary tracking-tight mb-2">Configurar Comunicado</h2>
                      <p className="text-on-surface-variant text-[16px]">Preencha as informações técnicas para gerar o informativo de manutenção.</p>
                    </header>

                    <div className="space-y-12">
                      {/* Custom Intro Editor */}
                      <div className="p-6 bg-primary/5 rounded-xl border border-primary/10">
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-primary font-bold text-[11px] uppercase tracking-[0.2em]">Texto de Introdução (Padrão)</label>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-on-surface-variant/60 uppercase">Tradução Automática</span>
                              <button 
                                onClick={toggleAutoTranslate}
                                className={`w-8 h-4 rounded-full relative transition-colors ${autoTranslate ? 'bg-primary' : 'bg-outline-variant/30'}`}
                              >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${autoTranslate ? 'left-4.5' : 'left-0.5'}`} />
                              </button>
                            </div>
                            {!autoTranslate && (
                              <button 
                                onClick={() => handleGenerateTranslations(0, true)}
                                disabled={isTranslating}
                                className="flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-[11px] font-bold uppercase transition-colors disabled:opacity-50"
                              >
                                <Sparkles size={10} />
                                {isTranslating ? 'Traduzindo...' : 'Traduzir Agora'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mb-4">
                          <div className="space-y-2">
                            <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em]">Título do Comunicado (Português)</label>
                            <input 
                              type="text"
                              value={data.customTitlePt}
                              onChange={(e) => setData(prev => ({ ...prev, customTitlePt: e.target.value }))}
                              className="w-full p-3 bg-white border border-outline-variant/10 rounded-xl focus:ring-2 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none"
                              placeholder="Parada Programada"
                            />
                          </div>
                        </div>
                        <textarea 
                          value={data.customIntro}
                          onChange={(e) => setData(prev => ({ ...prev, customIntro: e.target.value }))}
                          className="w-full p-4 bg-white border border-outline-variant/10 rounded-xl focus:ring-2 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none min-h-[100px] leading-relaxed"
                          placeholder="Digite o texto de introdução do comunicado..."
                        />
                        <p className="text-[11px] text-on-surface-variant/60 mt-2 italic">
                          {autoTranslate 
                            ? "Este texto será traduzido automaticamente para Inglês e Chinês." 
                            : "A tradução automática está desativada. Use o botão acima para traduzir manualmente."}
                        </p>
                      </div>

                      {data.windows.map((window, index) => (
                        <div key={window.id} className="p-6 bg-surface-container-low/30 rounded-xl border border-outline-variant/10 relative group/window">
                          <div className="flex justify-between items-center mb-6">
                            <h3 className="text-primary font-bold text-[12px] uppercase tracking-[0.2em]">Janela de Manutenção #{index + 1}</h3>
                            {data.windows.length > 1 && (
                              <button 
                                onClick={() => removeWindow(window.id)}
                                className="text-tertiary hover:bg-tertiary/10 p-1 rounded-full transition-colors"
                              >
                                <RotateCcw size={14} className="rotate-45" />
                              </button>
                            )}
                          </div>

                          <div className="space-y-8">
                            {/* Systems */}
                            <div>
                              <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em] mb-3">Sistemas Impactados</label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {(['Protheus', 'Fluig', 'SGBOM', 'Greendocs', 'Projuris'] as System[]).map(sys => (
                                  <button
                                    key={sys}
                                    onClick={() => toggleSystem(window.id, sys)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-sm transition-all text-left border ${
                                      window.systems.includes(sys)
                                        ? 'bg-primary/5 border-primary/20 text-primary'
                                        : 'bg-white border-transparent hover:bg-surface-container-high text-on-surface-variant'
                                    }`}
                                  >
                                    <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
                                      window.systems.includes(sys) ? 'bg-primary border-primary' : 'bg-white border-outline-variant'
                                    }`}>
                                      {window.systems.includes(sys) && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="text-[14px] font-medium">{sys}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Date & Time */}
                            <div className="grid gap-6">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em] mb-2">Data de Início</label>
                                  <div className="relative group">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={16} />
                                    <input 
                                      type="date"
                                      value={window.startDate}
                                      onChange={(e) => updateWindow(window.id, { startDate: e.target.value, endDate: window.endDate || e.target.value })}
                                      className="w-full pl-10 pr-4 py-2 bg-white border-none rounded-sm focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em] mb-2">Data de Término</label>
                                  <div className="relative group">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={16} />
                                    <input 
                                      type="date"
                                      value={window.endDate}
                                      onChange={(e) => updateWindow(window.id, { endDate: e.target.value })}
                                      className="w-full pl-10 pr-4 py-2 bg-white border-none rounded-sm focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em] mb-2">Hora de Início</label>
                                  <div className="relative group">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={16} />
                                    <input 
                                      type="time"
                                      value={window.startTime}
                                      onChange={(e) => updateWindow(window.id, { startTime: e.target.value })}
                                      className="w-full pl-10 pr-4 py-2 bg-white border-none rounded-sm focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em] mb-2">Hora de Término</label>
                                  <div className="relative group">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={16} />
                                    <input 
                                      type="time"
                                      value={window.endTime}
                                      onChange={(e) => updateWindow(window.id, { endTime: e.target.value })}
                                      className="w-full pl-10 pr-4 py-2 bg-white border-none rounded-sm focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <button 
                        onClick={addWindow}
                        className="w-full py-4 border-2 border-dashed border-outline-variant/30 rounded-xl text-on-surface-variant hover:border-primary/30 hover:text-primary transition-all flex items-center justify-center gap-2 text-[14px] font-bold"
                      >
                        <Plus size={16} />
                        Adicionar Outra Janela
                      </button>

                      {/* Info Box */}
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10"
                      >
                        <div className="text-primary shrink-0 mt-0.5">
                          <Info size={18} />
                        </div>
                        <p className="text-[14px] text-on-surface-variant leading-relaxed">
                          As alterações feitas aqui são refletidas em tempo real na pré-visualização ao lado. 
                          Certifique-se de validar todos os sistemas impactados antes de gerar o PDF final.
                        </p>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {activeSection === 'templates' && (
                  <motion.div
                    key="templates"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    <header className="mb-10 flex justify-between items-end">
                      <div>
                        <h2 className="text-[31px] font-headline font-extrabold text-primary tracking-tight mb-2">Modelos Prontos</h2>
                        <p className="text-on-surface-variant text-[16px]">Escolha um modelo para começar rapidamente ou gerencie seus próprios.</p>
                      </div>
                      <button 
                        onClick={() => {
                          setEditingTemplate(null);
                          setIsTemplateModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-[14px] font-bold hover:bg-primary-container hover:text-primary transition-all shadow-lg shadow-primary/10"
                      >
                        <Plus size={16} />
                        Novo Modelo
                      </button>
                    </header>

                    <div className="grid gap-4">
                      {templates.map((template) => (
                        <div key={template.id} className="relative group/template">
                          <button
                            onClick={() => applyTemplate(template)}
                            className="w-full flex items-start gap-4 p-5 bg-white border border-outline-variant/10 rounded-2xl hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all text-left group"
                          >
                            <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                              {ICON_MAP[template.iconType] || <Sparkles size={20} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-headline font-bold text-on-surface text-[16px]">{template.title}</h3>
                              <p className="text-on-surface-variant text-[14px] mt-1 leading-relaxed line-clamp-2">{template.description}</p>
                              {template.data.customIntro && (
                                <div className="mt-2 text-[11px] text-primary font-medium flex items-center gap-1">
                                  <Sparkles size={10} />
                                  Possui texto padrão personalizado
                                </div>
                              )}
                            </div>
                            <ChevronRight className="ml-auto text-outline-variant group-hover:text-primary transition-colors" size={18} />
                          </button>
                          
                          <div className="absolute top-4 right-12 flex items-center gap-1 opacity-0 group-hover/template:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTemplate(template);
                                setIsTemplateModalOpen(true);
                              }}
                              className="p-2 bg-white/80 backdrop-blur-sm border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:bg-white rounded-lg shadow-sm transition-all"
                              title="Editar Modelo"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTemplate(template.id);
                              }}
                              className="p-2 bg-white/80 backdrop-blur-sm border border-outline-variant/20 text-on-surface-variant hover:text-tertiary hover:bg-white rounded-lg shadow-sm transition-all"
                              title="Excluir Modelo"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {activeSection === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    <header className="mb-10">
                      <h2 className="text-[31px] font-headline font-extrabold text-primary tracking-tight mb-2">Configurações</h2>
                      <p className="text-on-surface-variant text-[16px]">Personalize as informações do rodapé e identidade.</p>
                    </header>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em]">Imagem do Cabeçalho</label>
                            {data.settings.headerImage && (
                              <button 
                                onClick={() => updateSettings({ headerImage: '' })}
                                className="text-[10px] font-bold text-red-500 uppercase hover:underline"
                              >
                                Remover
                              </button>
                            )}
                          </div>
                          <div className="relative group h-24 bg-white border border-outline-variant/10 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/30 transition-all">
                            {isUploadingHeader ? (
                              <div className="flex flex-col items-center gap-1">
                                <RotateCcw className="text-primary animate-spin" size={24} />
                                <span className="text-[11px] text-primary font-bold uppercase">Processando...</span>
                              </div>
                            ) : data.settings.headerImage ? (
                              <div className="relative w-full h-full">
                                <Image 
                                  src={data.settings.headerImage} 
                                  alt="Header Preview" 
                                  fill
                                  className="object-cover"
                                  onError={() => {
                                    updateSettings({ headerImage: '' });
                                  }}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <ImageIcon className="text-on-surface-variant/30" size={24} />
                                <span className="text-[11px] text-on-surface-variant/50 font-bold uppercase">Carregar</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                              <span className="text-white text-[11px] font-bold uppercase">Alterar</span>
                            </div>
                            <input 
                              type="file" 
                              accept="image/*"
                              disabled={isUploadingHeader}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setIsUploadingHeader(true);
                                  const reader = new FileReader();
                                  reader.onloadend = async () => {
                                    try {
                                      const compressed = await compressImage(reader.result as string);
                                      updateSettings({ headerImage: compressed });
                                    } catch (err) {
                                      console.error("Compression failed", err);
                                      showToast("Erro ao processar imagem", "error");
                                    } finally {
                                      setIsUploadingHeader(false);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em]">Imagem do Rodapé (Opcional)</label>
                            {data.settings.footerImage && (
                              <button 
                                onClick={() => updateSettings({ footerImage: '' })}
                                className="text-[10px] font-bold text-red-500 uppercase hover:underline"
                              >
                                Remover
                              </button>
                            )}
                          </div>
                          <div className="relative group h-24 bg-white border border-outline-variant/10 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/30 transition-all">
                            {isUploadingFooter ? (
                              <div className="flex flex-col items-center gap-1">
                                <RotateCcw className="text-primary animate-spin" size={24} />
                                <span className="text-[11px] text-primary font-bold uppercase">Processando...</span>
                              </div>
                            ) : data.settings.footerImage ? (
                              <div className="relative w-full h-full">
                                <Image 
                                  src={data.settings.footerImage} 
                                  alt="Footer Preview" 
                                  fill
                                  className="object-cover"
                                  onError={() => {
                                    updateSettings({ footerImage: '' });
                                  }}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <ImageIcon className="text-on-surface-variant/30" size={24} />
                                <span className="text-[11px] text-on-surface-variant/50 font-bold uppercase">Carregar</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                              <span className="text-white text-[11px] font-bold uppercase">Alterar</span>
                            </div>
                            <input 
                              type="file" 
                              accept="image/*"
                              disabled={isUploadingFooter}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setIsUploadingFooter(true);
                                  const reader = new FileReader();
                                  reader.onloadend = async () => {
                                    try {
                                      const compressed = await compressImage(reader.result as string);
                                      updateSettings({ footerImage: compressed });
                                    } catch (err) {
                                      console.error("Compression failed", err);
                                      showToast("Erro ao processar imagem", "error");
                                    } finally {
                                      setIsUploadingFooter(false);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em]">ChatGPT API Key (Opcional)</label>
                          <input 
                            type="password" 
                            value={data.settings.openaiApiKey || ''}
                            onChange={(e) => updateSettings({ openaiApiKey: e.target.value })}
                            placeholder="sk-..."
                            className="w-full px-4 py-2 bg-white border border-outline-variant/10 rounded-xl focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em]">Departamento</label>
                          <input 
                            type="text" 
                            value={data.settings.department}
                            onChange={(e) => updateSettings({ department: e.target.value })}
                            className="w-full px-4 py-2 bg-white border border-outline-variant/10 rounded-xl focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.1em]">Prompt de Tradução (IA)</label>
                        <textarea 
                          value={data.settings.customPrompt || DEFAULT_PROMPT}
                          onChange={(e) => updateSettings({ customPrompt: e.target.value })}
                          rows={8}
                          className="w-full px-4 py-3 bg-white border border-outline-variant/10 rounded-xl focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium outline-none font-mono leading-relaxed"
                        />
                        <p className="text-[12px] text-on-surface-variant/60">
                          Edite as instruções enviadas para a IA. O conteúdo do memorando será anexado automaticamente ao final deste prompt.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeSection === 'history' && (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    <header className="mb-10">
                      <h2 className="text-[31px] font-headline font-extrabold text-primary tracking-tight mb-2">Histórico de Envios</h2>
                      <p className="text-on-surface-variant text-[16px]">Visualize e recupere comunicados gerados anteriormente.</p>
                    </header>

                    {history.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-[300px] text-center space-y-4 bg-slate-50 rounded-2xl border border-dashed border-outline-variant/20">
                        <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-slate-300 shadow-sm">
                          <History size={32} />
                        </div>
                        <div>
                          <h3 className="font-headline font-bold text-on-surface text-[16px]">Nenhum histórico</h3>
                          <p className="text-on-surface-variant text-[15px] mt-1">Seus comunicados gerados aparecerão aqui.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {history.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 p-4 bg-white border border-outline-variant/10 rounded-xl hover:border-primary/20 transition-all group"
                          >
                            <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary shrink-0">
                              <FileText size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-headline font-bold text-on-surface text-[16px] truncate">
                                {(item.data.windows[0].systems || []).join(', ') || 'Sem sistemas'}
                              </h3>
                              <p className="text-[13px] text-on-surface-variant">
                                {new Date(item.timestamp).toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => applyHistoryItem(item)}
                                className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-colors"
                                title="Restaurar"
                              >
                                <RotateCcw size={16} />
                              </button>
                              <button 
                                onClick={() => deleteHistoryItem(item.id)}
                                className="p-2 hover:bg-tertiary/10 text-tertiary rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <RotateCcw size={16} className="rotate-45" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Preview Panel */}
          <section className="flex-1 bg-surface-container-low p-4 sm:p-8 lg:p-12 overflow-y-auto border-t md:border-t-0 md:border-l border-outline-variant/10">
            <div className="max-w-7xl mx-auto min-h-full flex flex-col">
              <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-primary font-bold text-[13px] uppercase tracking-[0.2em]">Pré-visualização do Comunicado (Trilingue)</h2>
                  {isTranslating && (
                    <div className="flex items-center gap-2 text-[11px] text-primary animate-pulse">
                      <RotateCcw size={10} className="animate-spin" />
                      <span className="text-[11px]">Traduzindo para EN e ZH...</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Rascunho Ativo</span>
                </div>
              </header>

              {/* Memo Document - Landscape Format */}
              <div 
                ref={previewRef}
                className="w-full min-h-[540px] memo-preview-glass shadow-2xl rounded-3xl border border-white/50 flex flex-col relative bg-white p-6 gap-4"
              >
                {/* Header Box */}
                <div className="relative h-[162px] bg-primary shrink-0 overflow-hidden rounded-2xl shadow-sm">
                  {data.settings.headerImage ? (
                    <div className="relative w-full h-full">
                      <Image 
                        src={data.settings.headerImage} 
                        alt="IT Memo Header Banner" 
                        fill
                        priority
                        className="object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-primary flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <ImageIcon className="text-white/40" size={32} />
                        <span className="text-white/60 text-[15px] font-bold uppercase tracking-widest">IT Maintenance Memo</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Document Body - 3 Columns */}
                <div className="flex-1 min-h-0">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-full">
                    {/* Portuguese Box */}
                    <div className="bg-slate-50/80 rounded-2xl p-5 border border-outline-variant/10 flex flex-col shadow-sm">
                      <div className="pb-3 border-b border-primary/10 mb-4">
                        <h5 className="text-[21px] font-headline font-bold text-on-surface leading-tight mt-1">{data.customTitlePt || 'Parada Programada'}</h5>
                      </div>
                      <div className="text-on-surface-variant text-[15px] leading-relaxed space-y-3 flex-1">
                        <p className="font-bold">Prezados colaboradores,</p>
                        <p>{data.customIntro || 'Informamos que realizaremos uma manutenção técnica essencial para garantir a estabilidade e performance de nossa infraestrutura digital.'}</p>
                        <div className="space-y-3 mt-4">
                          {data.windows.map((window) => (
                            <div key={window.id} className="p-3 bg-white rounded-xl border border-primary/5 shadow-sm">
                              <p className="text-on-surface text-[15px] font-bold truncate mb-1">
                                {(window.systems || []).join('/') || 'SISTEMAS'}
                              </p>
                              <p className="text-on-surface-variant text-[13px] leading-relaxed">
                                {formatWindowFullTextPt(window)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* English Box */}
                    <div className="bg-slate-50/80 rounded-2xl p-5 border border-outline-variant/10 flex flex-col shadow-sm">
                      <div className="pb-3 border-b border-primary/10 mb-4">
                        <h5 className="text-[21px] font-headline font-bold text-on-surface leading-tight mt-1">
                          {translations?.en.title || 'Scheduled Interruption'}
                        </h5>
                      </div>
                      <div className="text-on-surface-variant text-[15px] leading-relaxed space-y-3 flex-1">
                        <p className="font-bold">Dear colleagues,</p>
                        <p>{translations?.en.intro || 'We inform you that we will perform essential technical maintenance to ensure the stability and performance of our digital infrastructure.'}</p>
                        <div className="space-y-3 mt-4">
                          {Array.isArray(translations?.en.windows) ? translations?.en.windows.map((w, i) => (
                            <div key={i} className="p-3 bg-white rounded-xl border border-primary/5 shadow-sm">
                              <p className="text-on-surface text-[15px] font-bold truncate mb-1">{w.systems || 'SISTEMAS'}</p>
                              <p className="text-on-surface-variant text-[13px] leading-relaxed">
                                {w.text}
                              </p>
                            </div>
                          )) : (
                            <div className="animate-pulse space-y-2">
                              <div className="h-16 bg-white rounded-xl"></div>
                              <div className="h-16 bg-white rounded-xl"></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Chinese Box */}
                    <div className="bg-slate-50/80 rounded-2xl p-5 border border-outline-variant/10 flex flex-col shadow-sm">
                      <div className="pb-3 border-b border-primary/10 mb-4">
                        <h5 className="text-[21px] font-headline font-bold text-on-surface leading-tight mt-1">
                          {translations?.zh.title || '计划维护'}
                        </h5>
                      </div>
                      <div className="text-on-surface-variant text-[15px] leading-relaxed space-y-3 flex-1">
                        <p className="font-bold">各位同事：</p>
                        <p>{translations?.zh.intro || '我们通知您，我们将进行必要的业务技术维护，以确保我们数字基础设施的稳定性和性能。'}</p>
                        <div className="space-y-3 mt-4">
                          {Array.isArray(translations?.zh.windows) ? translations?.zh.windows.map((w, i) => (
                            <div key={i} className="p-3 bg-white rounded-xl border border-primary/5 shadow-sm">
                              <p className="text-on-surface text-[15px] font-bold truncate mb-1">{w.systems || 'SISTEMAS'}</p>
                              <p className="text-on-surface-variant text-[13px] leading-relaxed">
                                {w.text}
                              </p>
                            </div>
                          )) : (
                            <div className="animate-pulse space-y-2">
                              <div className="h-16 bg-white rounded-xl"></div>
                              <div className="h-16 bg-white rounded-xl"></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Box */}
                <footer className="h-[162px] border border-outline-variant/10 flex justify-center items-center bg-slate-50/50 shrink-0 relative overflow-hidden rounded-2xl">
                  {data.settings.footerImage ? (
                    <div className="relative w-full h-full">
                      <Image 
                        src={data.settings.footerImage} 
                        alt="Footer" 
                        fill
                        priority
                        className="object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 opacity-20">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Settings className="text-primary" size={16} />
                      </div>
                      <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">IT Infrastructure & Networks</span>
                    </div>
                  )}
                </footer>
              </div>
            </div>
          </section>
        </div>

        {/* Action Bar */}
        <div className="min-h-20 py-4 px-4 lg:px-8 flex flex-col sm:flex-row items-center justify-between bg-white border-t border-outline-variant/10 z-20 gap-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ActionButton icon={<RotateCcw size={16} />} label="Resetar" onClick={handleReset} />
            <ActionButton icon={<Copy size={16} />} label="Copiar Texto" onClick={handleCopyText} />
            <ActionButton icon={<ImageIcon size={16} />} label="Baixar Imagem" onClick={handleDownloadImage} />
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            <p className="hidden sm:block text-[11px] font-bold text-on-surface-variant/40 uppercase tracking-[0.2em]">
              © 2024 IT Maintenance Architect
            </p>
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-6 lg:px-8 py-3 bg-gradient-to-br from-primary to-primary-container text-white font-headline font-extrabold text-[16px] lg:text-[17px] rounded-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-3 group disabled:opacity-70 disabled:scale-100"
            >
              {isGenerating ? 'Gerando...' : 'Gerar Comunicado'}
              <Sparkles className={`text-white transition-transform ${isGenerating ? 'animate-spin' : 'group-hover:rotate-12'}`} size={18} />
            </button>
          </div>
        </div>
      </div>
      {/* Template Modal */}
      <AnimatePresence>
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTemplateModalOpen(false)}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <header className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-primary/5">
                <div>
                  <h3 className="text-[22px] font-headline font-extrabold text-primary tracking-tight">
                    {editingTemplate ? 'Editar Modelo' : 'Novo Modelo'}
                  </h3>
                  <p className="text-[15px] text-on-surface-variant">Configure os detalhes do seu modelo.</p>
                </div>
                <button 
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="p-2 hover:bg-white rounded-full transition-colors text-on-surface-variant"
                >
                  <X size={20} />
                </button>
              </header>

              <div className="p-6 overflow-y-auto space-y-6">
                <div>
                  <label className="block text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Título do Modelo</label>
                  <input 
                    type="text"
                    placeholder="Ex: Manutenção de Servidores"
                    className="w-full p-3 bg-surface-container-low border border-outline-variant/10 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-[15px]"
                    defaultValue={editingTemplate?.title}
                    id="template-title"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Descrição Curta</label>
                  <input 
                    type="text"
                    placeholder="Ex: Utilizado para comunicados de rotina..."
                    className="w-full p-3 bg-surface-container-low border border-outline-variant/10 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-[15px]"
                    defaultValue={editingTemplate?.description}
                    id="template-desc"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-bold text-primary uppercase tracking-widest mb-2">Ícone</label>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.keys(ICON_MAP).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          const el = document.getElementById('template-icon-type') as HTMLInputElement;
                          if (el) el.value = type;
                          // Force re-render for selection highlight if needed, but let's keep it simple
                          const buttons = document.querySelectorAll('.icon-select-btn');
                          buttons.forEach(b => b.classList.remove('bg-primary', 'text-white'));
                          buttons.forEach(b => b.classList.add('bg-surface-container-low', 'text-on-surface-variant'));
                          const target = document.getElementById(`icon-btn-${type}`);
                          if (target) {
                            target.classList.remove('bg-surface-container-low', 'text-on-surface-variant');
                            target.classList.add('bg-primary', 'text-white');
                          }
                        }}
                        id={`icon-btn-${type}`}
                        className={`icon-select-btn p-3 rounded-xl flex items-center justify-center transition-all ${
                          (editingTemplate?.iconType === type || (!editingTemplate && type === 'sparkles')) 
                            ? 'bg-primary text-white' 
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/10'
                        }`}
                      >
                        {ICON_MAP[type as keyof typeof ICON_MAP]}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" id="template-icon-type" defaultValue={editingTemplate?.iconType || 'sparkles'} />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Título do Comunicado (Português)</label>
                  <input 
                    type="text"
                    placeholder="Parada Programada"
                    className="w-full p-3 bg-surface-container-low border border-outline-variant/10 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-[15px]"
                    defaultValue={editingTemplate?.data.customTitlePt || INITIAL_DATA.customTitlePt}
                    id="template-title-pt"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Texto Padrão (Introdução)</label>
                  <textarea 
                    placeholder="Digite o texto que aparecerá por padrão neste modelo..."
                    className="w-full p-3 bg-surface-container-low border border-outline-variant/10 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none text-[15px] min-h-[120px] leading-relaxed"
                    defaultValue={editingTemplate?.data.customIntro}
                    id="template-intro"
                  />
                </div>

                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-[13px] text-primary font-medium leading-relaxed">
                    <Info size={12} className="inline mr-1 mb-0.5" />
                    As janelas de manutenção atuais (datas e horários) serão salvas como parte deste modelo.
                  </p>
                </div>
              </div>

              <footer className="p-6 border-t border-outline-variant/10 bg-surface-container-low flex gap-3">
                <button 
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="flex-1 py-3 text-[17px] font-bold text-on-surface-variant hover:bg-white rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    const title = (document.getElementById('template-title') as HTMLInputElement).value;
                    const description = (document.getElementById('template-desc') as HTMLInputElement).value;
                    const iconType = (document.getElementById('template-icon-type') as HTMLInputElement).value as any;
                    const customIntro = (document.getElementById('template-intro') as HTMLInputElement).value;
                    const customTitlePt = (document.getElementById('template-title-pt') as HTMLInputElement).value;
                    
                    if (!title) return;

                    handleSaveTemplate({
                      id: editingTemplate?.id,
                      title,
                      description,
                      iconType,
                      data: {
                        ...data,
                        customIntro,
                        customTitlePt
                      }
                    });
                  }}
                  className="flex-1 py-3 bg-primary text-white text-[17px] font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-container hover:text-primary transition-all"
                >
                  Salvar Modelo
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              toast.type === 'success' 
                ? 'bg-primary text-white border-primary/20' 
                : 'bg-tertiary text-white border-tertiary/20'
            }`}
          >
            {toast.type === 'success' ? <Check size={18} /> : <Info size={18} />}
            <span className="text-[17px] font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {templateToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTemplateToDelete(null)}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-[22px] font-headline font-extrabold text-on-surface mb-2">Excluir Modelo?</h3>
              <p className="text-on-surface-variant text-[17px] mb-8">Esta ação não pode ser desfeita. O modelo será removido permanentemente.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setTemplateToDelete(null)}
                  className="flex-1 py-3 text-[17px] font-bold text-on-surface-variant hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteTemplate(templateToDelete)}
                  className="flex-1 py-3 bg-tertiary text-white text-[17px] font-bold rounded-xl shadow-lg shadow-tertiary/20 hover:bg-tertiary-container hover:text-tertiary transition-all"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center"
          >
            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6"></div>
            <h3 className="text-[22px] font-headline font-extrabold text-primary tracking-tight mb-2">Gerando Comunicado</h3>
            <p className="text-on-surface-variant text-[17px] animate-pulse">Processando layout e traduções de alta qualidade...</p>
            <div className="mt-8 px-4 py-2 bg-primary/5 rounded-full border border-primary/10">
              <p className="text-[12px] font-bold text-primary uppercase tracking-widest">Aguarde um momento</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all group ${
        active 
          ? 'bg-primary/5 text-primary font-bold translate-x-1' 
          : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
      }`}
    >
      <span className={`${active ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'} transition-colors`}>
        {icon}
      </span>
      <span className="font-headline text-[16px] tracking-tight">{label}</span>
      {active && <div className="ml-auto w-1 h-4 bg-primary rounded-full"></div>}
    </button>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-on-surface-variant hover:text-primary font-headline text-[13px] font-bold transition-all hover:bg-surface-container-low rounded-lg group"
    >
      <span className="group-hover:scale-110 transition-transform">{icon}</span>
      {label}
    </button>
  );
}
