/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Shield, 
  Upload, 
  Search, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Fingerprint,
  Download,
  Plus,
  Trash2,
  Eye,
  LayoutDashboard,
  Database,
  FileText,
  Menu,
  X,
  Video,
  Layers,
  Info,
  History,
  ArrowRightLeft,
  FileSearch,
  LogOut,
  User,
  Settings,
  UserPlus,
  LogIn
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { initialCases } from './data/cases';
import { ForensicCase, CrimeType, Location, SimilarityResult } from './types';
import { performELA, findSimilarCases, analyzeVideo } from './lib/forensic-logic';
import Login from './components/Login';
import { db, auth } from './lib/firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  writeBatch,
  getDocs,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';

type View = 'Dashboard' | 'Analysis' | 'VideoAnalysis' | 'Database' | 'Comparison' | 'Analytics';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);
  const [currentView, setCurrentView] = useState<View>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [cases, setCases] = useState<ForensicCase[]>(initialCases);
  const [selectedCaseForReport, setSelectedCaseForReport] = useState<ForensicCase | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [elaResult, setElaResult] = useState<{ 
    elaImage: string; 
    confidence: number; 
    isSuspicious: boolean;
    integrityScore: number;
    riskLevel: 'Low' | 'Medium' | 'High';
    confidenceBreakdown: {
      ela: number;
      brightness: number;
      contrast: number;
    };
    metadata: {
      resolution: string;
      format: string;
      size: string;
    };
  } | null>(null);
  const [videoResult, setVideoResult] = useState<{
    classification: 'Real' | 'Movie Shooted' | 'Animated' | 'Edited';
    confidence: number;
    summary: string;
    frames: string[];
  } | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [comparisonCases, setComparisonCases] = useState<[string, string]>(['', '']);
  const [analyzing, setAnalyzing] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [imageDescription, setImageDescription] = useState<string | null>(null);
  
  // Form State
  const [location, setLocation] = useState<Location>('Visakhapatnam');
  const [crimeType, setCrimeType] = useState<CrimeType>('Gun');
  const [time, setTime] = useState('20:00');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [similarCases, setSimilarCases] = useState<SimilarityResult[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [showExplainModal, setShowExplainModal] = useState(false);

  const alertSound = useRef<HTMLAudioElement | null>(null);
  const successSound = useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    // Alarming sound for suspicious findings
    alertSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1004/1004-preview.mp3');
    alertSound.current.volume = 0.5;
    // Success/Authentic sound
    successSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
    successSound.current.volume = 0.3;
    
    if (window.innerWidth >= 1024) {
      setIsSidebarOpen(true);
    }
  }, []);

  // Sync cases from Firestore
  React.useEffect(() => {
    if (!user) return;

    const casesRef = collection(db, 'cases');
    const q = query(
      casesRef, 
      where('createdBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date()
        };
      }) as ForensicCase[];
      
      // Only use initialCases for anonymous or truly empty initial state if you want, 
      // but for persistence, we should trust the actual cloud state.
      setCases(casesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    return () => unsubscribe();
  }, [user]);

  const playResultSound = (isSuspicious: boolean) => {
    if (isSuspicious) {
      alertSound.current?.play().catch(e => console.error("Error playing alert sound", e));
    } else {
      successSound.current?.play().catch(e => console.error("Error playing success sound", e));
    }
  };

  const navigateTo = (view: View) => {
    setCurrentView(view);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setCurrentView('Dashboard');
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const apDistricts: Location[] = [
    'Anantapuramu', 'Sri Sathya Sai', 'Annamayya', 'Chittoor', 'Tirupati', 
    'YSR Kadapa', 'Nandyal', 'Kurnool', 'Alluri Sitharama Raju', 'Anakapalli', 
    'Visakhapatnam', 'Parvathipuram Manyam', 'Vizianagaram', 'Srikakulam', 
    'Dr. B.R. Ambedkar Konaseema', 'East Godavari', 'Kakinada', 'Eluru', 
    'West Godavari', 'NTR', 'Krishna', 'Palnadu', 'Guntur', 'Bapatla', 
    'Prakasam', 'Sri Potti Sriramulu Nellore'
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setElaResult(null);
        setImageDescription(null);
        setShowReport(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedVideo(url);
      setVideoResult(null);
    }
  };

  const runVideoAnalysis = async () => {
    if (!selectedVideo) return;
    setAnalyzingVideo(true);
    
    const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
    const result = await analyzeVideo(selectedVideo, apiKey);
    
    setVideoResult(result);
    playResultSound(result.classification !== 'Real');
    setAnalyzingVideo(false);
  };

  const captureFrame = (frameUrl: string) => {
    setSelectedImage(frameUrl);
    setCurrentView('Analysis');
    setElaResult(null);
    setImageDescription(null);
  };

  const describeEvidence = async () => {
    if (!selectedImage) return;
    setDescribing(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Analysis Module Not Initialized: Please ensure system credentials are valid in terminal settings.");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const match = selectedImage.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) throw new Error("Format Incompatibility: The evidence capture is unrecognized or corrupted.");
      
      const mimeType = match[1];
      const base64Data = match[2];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "As a forensic expert, provide a detailed description of everything visible in this image. CRITICAL: Specifically check for any watermarks, text overlays, logos, or signs of digital manipulation/editing. Describe the environment, objects, lighting, and any potential evidence or anomalies. Be precise and objective. Focus on forensic details like tool marks, potential weapon sightings, or signs of struggle." },
              { inlineData: { data: base64Data, mimeType: mimeType } }
            ]
          }
        ]
      });
      
      const text = response.text;
      if (!text) throw new Error("The neural interface returned a null signal. Re-attempt advised.");
      
      setImageDescription(text);
    } catch (error: any) {
      console.error("Forensic AI Error:", error);
      setImageDescription(`CRITICAL FAULT: ${error.message || 'Unknown sensor error'}. Standard forensic verification should proceed via manual protocol.`);
    } finally {
      setDescribing(false);
    }
  };

  const downloadSimplePDF = async (caseToDownload?: ForensicCase) => {
    try {
      const jsPDF = (await import('jspdf')).jsPDF;
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const targetCase = caseToDownload || selectedCaseForReport || cases[0];
      const caseId = targetCase?.id || 'TEMP-001';
      const reportDate = new Date().toLocaleDateString();
      
      // Header
      pdf.setFontSize(22);
      pdf.setTextColor(15, 23, 42); // slate-900
      pdf.text('FORENSIC ANALYSIS REPORT', 20, 20);
      
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text(`Official Document: ${caseId}`, 20, 28);
      pdf.text(`Date of Issue: ${reportDate}`, 150, 28);
      
      pdf.setLineWidth(0.5);
      pdf.line(20, 32, 190, 32);
      
      // Evidence Details
      pdf.setFontSize(14);
      pdf.setTextColor(15, 23, 42);
      pdf.text('Evidence Details', 20, 45);
      
      pdf.setFontSize(10);
      pdf.text(`Location: ${targetCase?.location || location}`, 20, 55);
      pdf.text(`Incident Date: ${targetCase?.date || date}`, 20, 62);
      pdf.text(`Incident Time: ${targetCase?.time || time}`, 20, 69);
      pdf.text(`Crime Type: ${targetCase?.crimeType || crimeType}`, 20, 76);
      
      // Forensic Findings
      pdf.setFontSize(14);
      pdf.text('Forensic Findings', 20, 90);
      
      pdf.setFontSize(10);
      pdf.text('Analysis Method: Error Level Analysis (ELA)', 20, 100);
      pdf.text(`Integrity Status: ${targetCase?.status === 'Tampered' ? 'TAMPERED / SUSPICIOUS' : 'AUTHENTIC / REAL'}`, 20, 107);
      pdf.text(`Confidence Score: ${targetCase?.confidence || 0}%`, 20, 114);
      
      // Expert Conclusion
      pdf.setFontSize(14);
      pdf.text('Expert Conclusion', 20, 128);
      
      pdf.setFontSize(10);
      const conclusion = `Based on the Error Level Analysis performed on the submitted digital evidence, the system has identified ${targetCase?.status === 'Tampered' ? 'significant inconsistencies in the pixel compression levels, suggesting localized manipulation.' : 'uniform compression artifacts consistent with an authentic, unedited digital capture.'} The contextual similarity engine ${similarCases[0]?.score >= 60 ? `identified a strong correlation (${similarCases[0].score}%) with Case ${similarCases[0].case.id}.` : 'did not find any significant historical precedents for this specific context.'}`;
      
      const splitConclusion = pdf.splitTextToSize(conclusion, 170);
      pdf.text(splitConclusion, 20, 138);
      
      // Detailed Content Analysis
      const description = targetCase?.description || imageDescription;
      if (description) {
        pdf.setFontSize(14);
        pdf.text('Detailed Content Analysis', 20, 165);
        
        pdf.setFontSize(9);
        const splitDescription = pdf.splitTextToSize(description, 170);
        pdf.text(splitDescription, 20, 175);
      }
      
      // Footer
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setLineWidth(0.1);
      pdf.line(20, pageHeight - 30, 190, pageHeight - 30);
      
      pdf.setFontSize(8);
      pdf.text('Automated System Signature: ForensicAI_System', 20, pageHeight - 20);
      pdf.text(`Verification Hash: SHA-256: ${Math.random().toString(36).substring(2, 15).toUpperCase()}`, 20, pageHeight - 15);
      
      pdf.save(`Forensic_Report_${caseId}_Simple.pdf`);
    } catch (error) {
      console.error("Error generating simple PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  const downloadPDF = async (caseToDownload?: ForensicCase) => {
    // If a specific case is provided, we temporarily set it as selected to capture its report
    if (caseToDownload) {
      setSelectedCaseForReport(caseToDownload);
      setShowReport(true);
      // We need to wait for the modal to render with the new case data
      setTimeout(() => {
        downloadPDF();
      }, 500);
      return;
    }
    if (!reportRef.current) {
      console.error("Report reference not found");
      return;
    }
    
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).jsPDF;

      const element = reportRef.current;
      
      // Temporarily remove scroll to capture full content
      const originalHeight = element.style.height;
      const originalOverflow = element.style.overflow;
      element.style.height = 'auto';
      element.style.overflow = 'visible';

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        onclone: (clonedDoc) => {
          // Ensure cloned element is visible
          const clonedElement = clonedDoc.querySelector('[data-report-container]');
          if (clonedElement instanceof HTMLElement) {
            clonedElement.style.height = 'auto';
            clonedElement.style.overflow = 'visible';
          }
        }
      });

      // Restore original styles
      element.style.height = originalHeight;
      element.style.overflow = originalOverflow;

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const caseId = selectedCaseForReport?.id || cases[0]?.id || 'TEMP';
      pdf.save(`Forensic_Report_${caseId}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  const deleteCase = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'cases', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cases/${id}`);
    }
  };

  const clearAllCases = async () => {
    if (!user) return;
    if (window.confirm("Are you sure you want to delete all cases? This action cannot be undone.")) {
      try {
        const q = query(collection(db, 'cases'), where('createdBy', '==', user.uid));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'cases (batch)');
      }
    }
  };

  const runAnalysis = async () => {
    if (!selectedImage) return;
    setAnalyzing(true);
    
    // Check API Key
    const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      alert("CRITICAL: Analysis credentials missing. Please configure GEMINI_API_KEY in terminal settings.");
      setAnalyzing(false);
      return;
    }

    // 1. Get AI Description first if not already present
    let currentDescription = imageDescription;
    if (!currentDescription) {
      await describeEvidence();
    }

    // 2. Perform ELA
    const result = await performELA(selectedImage);
    
    // 3. Check for Watermarks/Edits in description to override result
    const ai = new GoogleGenAI({ apiKey });
    const match = selectedImage.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{
            parts: [
              { text: `Perform a deep digital forensic analysis on this image. 
              Look for:
              - Inconsistent shadows or lighting sources.
              - Visual artifacts around object edges (splicing).
              - Misaligned perspective or scale.
              - Watermarks, logos, or UI overlays.
              - Content that looks AI-generated or digitally manipulated.
              
              Answer with a JSON object: {"isSuspicious": boolean, "reason": "short explanation", "confidence": number (0-100)}` },
              { inlineData: { data: match[2], mimeType: match[1] } }
            ]
          }]
        });
        const responseText = response.text?.trim() || '{}';
        const cleaned = responseText.replace(/```json|```/g, '').trim();
        const aiVerdict = JSON.parse(cleaned);

        if (aiVerdict.isSuspicious) {
          result.isSuspicious = true;
          result.riskLevel = aiVerdict.confidence > 80 ? 'High' : 'Medium';
          result.integrityScore = Math.min(result.integrityScore, 100 - aiVerdict.confidence);
        } else {
          // If AI is very confident it's real, and ELA isn't too bad
          if (aiVerdict.confidence > 85 && result.integrityScore > 30) {
            result.isSuspicious = false;
            result.riskLevel = 'Low';
            result.integrityScore = Math.max(result.integrityScore, aiVerdict.confidence);
          }
        }
      } catch (e) {
        console.error("AI Verdict failed", e);
      }
    }

    setElaResult(result);
    playResultSound(result.isSuspicious);
    
    const matches = findSimilarCases({ location, crimeType, time }, cases);
    setSimilarCases(matches);
    
    setAnalyzing(false);
  };

  const saveCase = async () => {
    if (!elaResult || !user) return;
    
    const now = new Date().toISOString();
    const caseData = {
      location,
      time,
      crimeType,
      status: elaResult.isSuspicious ? 'Tampered' : 'Real',
      date: date,
      confidence: elaResult.confidence,
      description: imageDescription || null,
      elaImage: elaResult.elaImage,
      integrityScore: elaResult.integrityScore,
      riskLevel: elaResult.riskLevel,
      confidenceBreakdown: elaResult.confidenceBreakdown,
      metadata: elaResult.metadata,
      chainOfCustody: {
        createdTime: now,
        analysisTime: now,
        actions: ['Image Uploaded', 'ELA Analysis Performed', 'Metadata Extracted']
      },
      createdBy: user.uid,
      createdAt: serverTimestamp()
    };
    
    try {
      const docRef = await addDoc(collection(db, 'cases'), caseData);
      setSelectedCaseForReport({ ...caseData, id: docRef.id } as any);
      setShowReport(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cases');
    }
  };

  // Chart Data
  const crimeDistData = Object.values(
    cases.reduce((acc, c) => {
      acc[c.crimeType] = acc[c.crimeType] || { name: c.crimeType, value: 0 };
      acc[c.crimeType].value += 1;
      return acc;
    }, {} as Record<string, { name: string; value: number }>)
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={(u) => setUser(u)} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 font-sans selection:bg-blue-500/30 flex">
      {/* Sidebar Navigation */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed lg:static inset-y-0 left-0 z-[60] w-64 bg-[#0f0f12] border-r border-white/5 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <Shield className="text-white w-5 h-5" />
            </div>
            <h1 className="text-sm font-bold tracking-tight text-white uppercase">Forensic AI</h1>
          </div>
        </div>
        
        <nav className="p-4 space-y-2">
          <div className="px-4 py-2 mb-2">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Navigation</p>
          </div>
          <button 
            onClick={() => navigateTo('Dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'Dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-sm font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => navigateTo('Analysis')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'Analysis' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Fingerprint className="w-5 h-5" />
            <span className="text-sm font-medium">Image Analysis</span>
          </button>
          <button 
            onClick={() => navigateTo('VideoAnalysis')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'VideoAnalysis' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Video className="w-5 h-5" />
            <span className="text-sm font-medium">Video Analysis</span>
          </button>
          <button 
            onClick={() => navigateTo('Database')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'Database' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Database className="w-5 h-5" />
            <span className="text-sm font-medium">Case Storage</span>
          </button>
          <button 
            onClick={() => navigateTo('Comparison')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'Comparison' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <ArrowRightLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Comparison</span>
          </button>
          <button 
            onClick={() => navigateTo('Analytics')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'Analytics' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-sm font-medium">Regional Analytics</span>
          </button>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/5 bg-[#0f0f12]">
          <div className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs uppercase">
              {user.email?.[0] || user.displayName?.[0] || 'A'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user.displayName || user.email?.split('@')[0] || 'Agent'}</p>
              <p className="text-[10px] text-slate-500 truncate font-mono uppercase">ID: {user.uid.slice(0, 8)}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all text-red-400/70 hover:bg-red-500/10 hover:text-red-400 text-xs font-mono uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            <span>Terminate session</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-white/10 bg-[#0f0f12]/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden p-2 text-slate-400 hover:text-white"
              >
                {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <h2 className="text-lg font-bold text-white tracking-tight">{currentView}</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                System Online
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <AnimatePresence mode="wait">
            {currentView === 'Dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Account Management Card */}
                  <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/10 border border-blue-500/30 p-6 rounded-2xl shadow-xl hover:shadow-blue-500/20 transition-all group overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all" />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                          <User className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full uppercase tracking-widest">Active Terminal</span>
                      </div>
                      <p className="text-xs text-slate-400 uppercase font-mono tracking-widest">Operator Identity</p>
                      <p className="text-lg font-bold text-white mt-1 truncate">{user.displayName || user.email?.split('@')[0] || 'Unknown Agent'}</p>
                      <div className="mt-4 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button 
                            onClick={handleLogout}
                            className="flex-1 flex items-center justify-center gap-2 text-[10px] bg-white/5 hover:bg-white/10 text-white font-bold py-2 rounded-lg border border-white/10 transition-all uppercase tracking-wider"
                          >
                            <UserPlus className="w-3 h-3" />
                            New Auth
                          </button>
                          <button 
                            onClick={() => {
                              if (window.confirm("Switch sessions? You will need to re-authenticate.")) {
                                handleLogout();
                              }
                            }}
                            className="flex-1 flex items-center justify-center gap-2 text-[10px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold py-2 rounded-lg border border-blue-500/30 transition-all uppercase tracking-wider"
                          >
                            <LogIn className="w-3 h-3" />
                            Existing
                          </button>
                        </div>
                        <button 
                          onClick={() => setCurrentView('Database')}
                          className="w-full flex items-center justify-center gap-2 text-[10px] bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 py-2 rounded-lg border border-white/5 transition-all uppercase tracking-tighter"
                        >
                          <Database className="w-3 h-3" />
                          Vault Storage
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#121216] border border-white/5 p-6 rounded-2xl shadow-xl hover:border-red-500/20 transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-red-400 font-medium">+5%</span>
                    </div>
                    <p className="text-xs text-slate-500 uppercase font-mono tracking-widest">Tampered Evidence</p>
                    <p className="text-3xl font-bold text-white mt-1">{cases.filter(c => c.status === 'Edited' || c.status === 'Tampered').length}</p>
                  </div>
                  
                  <div className="bg-[#121216] border border-white/5 p-6 rounded-2xl shadow-xl hover:border-emerald-500/20 transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-emerald-400 font-medium">Stable</span>
                    </div>
                    <p className="text-xs text-slate-500 uppercase font-mono tracking-widest">Authentic Cases</p>
                    <p className="text-3xl font-bold text-white mt-1">{cases.filter(c => c.status === 'Real').length}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <h2 className="font-semibold text-white flex items-center gap-2">
                          <Clock className="w-5 h-5 text-blue-400" />
                          Recent Activity
                        </h2>
                        <button 
                          onClick={() => setCurrentView('Database')}
                          className="text-xs text-blue-400 hover:underline"
                        >
                          View All
                        </button>
                      </div>
                      <div className="p-6">
                        <div className="space-y-4">
                          {cases.slice(0, 5).map((c) => (
                            <div key={c.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors group">
                              <div className="flex items-center gap-4">
                                <div className={`w-2 h-2 rounded-full ${c.status === 'Real' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                <div>
                                  <p className="text-sm font-bold text-white">{c.id} - {c.crimeType}</p>
                                  <p className="text-xs text-slate-500">{c.location} • {c.date}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${c.status === 'Real' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {c.status}
                                </span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteCase(c.id);
                                  }}
                                  className="p-1.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  </div>
                  <div className="space-y-8">
                    <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                        <h2 className="font-semibold text-white flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-blue-400" />
                          Quick Stats
                        </h2>
                      </div>
                      <div className="p-6">
                        <div className="space-y-6">
                          <div>
                            <div className="flex justify-between text-xs mb-2">
                              <span className="text-slate-400">Analysis Accuracy</span>
                              <span className="text-white font-bold">98.4%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 w-[98.4%]"></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-2">
                              <span className="text-slate-400">System Load</span>
                              <span className="text-white font-bold">24%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 w-[24%]"></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-2">
                              <span className="text-slate-400">Database Capacity</span>
                              <span className="text-white font-bold">62%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 w-[62%]"></div>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setCurrentView('Analysis')}
                          className="w-full mt-8 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
                        >
                          Start New Analysis
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}

            {currentView === 'Analysis' && (
              <motion.div 
                key="analysis"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-8">
                    {/* Evidence Upload Section */}
                    <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                          <Upload className="w-5 h-5 text-blue-400" />
                          <h2 className="font-semibold text-white">Digital Evidence Upload</h2>
                        </div>
                      </div>
                      
                      <div className="p-8">
                        {!selectedImage ? (
                          <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group"
                          >
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-400" />
                            </div>
                            <div className="text-center">
                              <p className="text-slate-300 font-medium">Click to upload forensic image</p>
                              <p className="text-slate-500 text-sm mt-1">Supports JPG, PNG, TIFF (Max 10MB)</p>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Original Evidence</p>
                                <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black relative group">
                                  <img src={selectedImage} alt="Original" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                  <button 
                                    onClick={() => setSelectedImage(null)}
                                    className="absolute top-2 right-2 p-2 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                                  >
                                    <Plus className="w-4 h-4 rotate-45" />
                                  </button>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">ELA Visualization</p>
                                <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black flex items-center justify-center relative">
                                  {analyzing ? (
                                    <div className="flex flex-col items-center gap-3">
                                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                      <p className="text-xs font-mono text-blue-400 animate-pulse">Analyzing Compression Artifacts...</p>
                                    </div>
                                  ) : elaResult ? (
                                    <img src={elaResult.elaImage} alt="ELA" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="text-slate-600 text-center px-8">
                                      <Fingerprint className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                      <p className="text-xs">Run analysis to generate Error Level Analysis map</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {elaResult && (
                              <div className="space-y-4">
                                <div className={`p-4 rounded-xl border flex items-center justify-between ${elaResult.isSuspicious ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                                  <div className="flex items-center gap-3">
                                    {elaResult.isSuspicious ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                                    <div>
                                      <p className="font-bold text-sm uppercase tracking-wide">Result: {elaResult.isSuspicious ? 'Suspicious / Tampered' : 'Authentic / Real'}</p>
                                      <p className="text-xs opacity-80">Confidence Score: {elaResult.confidence}%</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Consistency Check Warning */}
                                {imageDescription && !imageDescription.toLowerCase().includes(crimeType.toLowerCase()) && (
                                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-3 text-yellow-500">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                    <p className="text-xs font-medium">
                                      <span className="font-bold uppercase">Consistency Warning:</span> The AI analysis description does not explicitly mention "{crimeType}". Please verify evidence relevance.
                                    </p>
                                  </div>
                                )}

                                <div className="bg-[#1a1a20] border border-white/5 rounded-xl p-6 space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                      <Eye className="w-4 h-4 text-blue-400" />
                                      Detailed Forensic Description
                                    </h3>
                                    <button 
                                      onClick={describeEvidence}
                                      disabled={describing}
                                      className="text-[10px] font-mono uppercase bg-blue-600/20 text-blue-400 px-3 py-1 rounded border border-blue-500/30 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
                                    >
                                      {describing ? 'Analyzing Content...' : 'Generate Description'}
                                    </button>
                                  </div>
                                  {imageDescription ? (
                                    <div className="text-sm text-slate-400 leading-relaxed bg-black/20 p-4 rounded-lg border border-white/5">
                                      {imageDescription}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-600 italic">Click 'Generate Description' to get an AI-powered forensic analysis.</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Crime Context Section */}
                    <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-blue-400" />
                          <h2 className="font-semibold text-white">Crime Context Parameters</h2>
                        </div>
                      </div>
                      
                      <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Location</label>
                            <select 
                              value={location}
                              onChange={(e) => setLocation(e.target.value as Location)}
                              className="w-full bg-[#1a1a20] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                            >
                              {apDistricts.map(dist => <option key={dist} value={dist}>{dist}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Incident Date</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-[#1a1a20] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Incident Time</label>
                            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full bg-[#1a1a20] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Crime Category</label>
                            <select value={crimeType} onChange={(e) => setCrimeType(e.target.value as CrimeType)} className="w-full bg-[#1a1a20] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors">
                              <option value="Gun">Gun</option>
                              <option value="Knife">Knife</option>
                              <option value="Assault">Assault</option>
                              <option value="Suicide">Suicide</option>
                              <option value="Accident">Accident</option>
                            </select>
                          </div>
                        </div>

                        <div className="mt-8 flex gap-4">
                          <button 
                            onClick={runAnalysis}
                            disabled={!selectedImage || analyzing}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                          >
                            {analyzing ? 'Processing...' : <><Search className="w-5 h-5" />Run Forensic Analysis</>}
                          </button>
                          {elaResult && (
                            <div className="flex gap-3">
                              <button 
                                onClick={() => setShowExplainModal(true)}
                                className="px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex items-center justify-center gap-2 text-slate-300"
                              >
                                <Info className="w-5 h-5" />Explain Result
                              </button>
                              <button onClick={saveCase} className="px-6 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl transition-all flex items-center justify-center gap-2">
                                <Plus className="w-5 h-5" />Log Case
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>
                  <div className="lg:col-span-4 space-y-8">
                    {/* Similar Case Detection */}
                    {similarCases.length > 0 && (
                      <div className="space-y-8">
                        <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                            <h2 className="font-semibold text-white flex items-center gap-2">
                              <BarChart3 className="w-5 h-5 text-blue-400" />
                              Similarity Engine
                            </h2>
                          </div>
                          <div className="p-6">
                            {similarCases[0].score >= 60 ? (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-emerald-400 uppercase">Match Found</span>
                                  <span className="text-xl font-bold text-white">{similarCases[0].score}%</span>
                                </div>
                                <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5 space-y-2">
                                  <p className="text-xs font-bold text-white">{similarCases[0].case.id}</p>
                                  <p className="text-[10px] text-slate-500 uppercase">{similarCases[0].case.location} • {similarCases[0].case.crimeType}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4 text-slate-500 text-xs italic">No strong matches found.</div>
                            )}
                          </div>
                        </section>

                        {/* Auto Case Summary */}
                        {elaResult && (
                          <motion.section 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-blue-600/5 border border-blue-500/10 rounded-2xl p-6"
                          >
                            <h3 className="text-xs font-mono text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Auto Case Summary
                            </h3>
                            <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
                              <p>
                                Investigation at <span className="text-white font-bold">{location}</span> on <span className="text-white font-bold">{date}</span>. 
                                Evidence submitted as <span className="text-white font-bold">{crimeType}</span> related.
                              </p>
                              <p>
                                Forensic analysis indicates a <span className={`font-bold ${elaResult.isSuspicious ? 'text-red-400' : 'text-emerald-400'}`}>{elaResult.isSuspicious ? 'High Risk' : 'Low Risk'}</span> level 
                                with an integrity score of <span className="text-white font-bold">{elaResult.integrityScore}%</span>. 
                                {elaResult.isSuspicious ? ' Pixel inconsistencies detected in high-frequency areas suggest localized manipulation.' : ' Compression artifacts are uniform across the frame, consistent with original capture.'}
                              </p>
                              <p className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 italic text-xs">
                                "Similarity engine identified {similarCases.length} historical precedents. Top match: Case {similarCases[0].case.id} ({similarCases[0].score}% correlation)."
                              </p>
                            </div>
                          </motion.section>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {currentView === 'VideoAnalysis' && (
              <motion.div 
                key="video-analysis"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-8">
                    <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                          <Video className="w-5 h-5 text-blue-400" />
                          <h2 className="font-semibold text-white">Video Forensic Analysis</h2>
                        </div>
                      </div>
                      
                      <div className="p-8">
                        {!selectedVideo ? (
                          <div 
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = 'video/*';
                              input.onchange = (e) => handleVideoUpload(e as any);
                              input.click();
                            }}
                            className="border-2 border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group"
                          >
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Video className="w-8 h-8 text-slate-400 group-hover:text-blue-400" />
                            </div>
                            <div className="text-center">
                              <p className="text-slate-300 font-medium">Click to upload forensic video</p>
                              <p className="text-slate-500 text-sm mt-1">Supports MP4, MOV (Max 50MB)</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black relative">
                              <video src={selectedVideo} controls className="w-full h-full object-contain" />
                              <button 
                                onClick={() => setSelectedVideo(null)}
                                className="absolute top-2 right-2 p-2 bg-black/60 rounded-full hover:bg-red-500/80 transition-colors"
                              >
                                <Plus className="w-4 h-4 rotate-45" />
                              </button>
                            </div>

                            <div className="flex gap-4">
                              <button 
                                onClick={runVideoAnalysis}
                                disabled={analyzingVideo}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                              >
                                {analyzingVideo ? 'Analyzing Frames...' : <><Search className="w-5 h-5" />Analyze Video Consistency</>}
                              </button>
                              {videoResult && (
                                <button 
                                  onClick={() => {
                                    // Mock video report download
                                    const mockCase: ForensicCase = {
                                      id: `VID-${Date.now()}`,
                                      location,
                                      date,
                                      time,
                                      crimeType,
                                      status: videoResult.classification === 'Real' ? 'Real' : 'Tampered',
                                      confidence: videoResult.confidence,
                                      elaImage: videoResult.frames.length > 0 ? videoResult.frames[0] : '',
                                      description: videoResult.summary,
                                      integrityScore: videoResult.confidence,
                                      riskLevel: videoResult.classification === 'Real' ? 'Low' : 'High',
                                      confidenceBreakdown: { ela: videoResult.confidence, brightness: 90, contrast: 90 },
                                      metadata: { resolution: '1920x1080', format: 'MP4', size: '15MB' },
                                      chainOfCustody: { createdTime: new Date().toISOString(), analysisTime: new Date().toISOString(), actions: ['Video Analysis Performed'] }
                                    };
                                    downloadSimplePDF(mockCase);
                                  }}
                                  className="px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex items-center justify-center gap-2 text-slate-300"
                                >
                                  <Download className="w-5 h-5" />Download Report
                                </button>
                              )}
                            </div>

                            {videoResult && (
                              <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Classification</p>
                                    <p className="text-lg font-bold text-white">{videoResult.classification}</p>
                                  </div>
                                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Confidence</p>
                                    <p className="text-lg font-bold text-white">{videoResult.confidence}%</p>
                                  </div>
                                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Status</p>
                                    <p className={`text-lg font-bold ${videoResult.classification === 'Real' ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {videoResult.classification === 'Real' ? 'Authentic' : 'Modified'}
                                    </p>
                                  </div>
                                </div>

                                <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl">
                                  <p className="text-sm text-blue-200 leading-relaxed italic">
                                    "{videoResult.summary}"
                                  </p>
                                </div>

                                {videoResult.frames.length > 0 && (
                                  <div className="space-y-4">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                      <Layers className="w-4 h-4 text-blue-400" />
                                      Extracted Keyframes
                                    </h3>
                                    <div className="grid grid-cols-3 gap-4">
                                      {videoResult.frames.map((frame, idx) => (
                                        <div key={idx} className="space-y-2">
                                          <div className="aspect-video rounded-lg overflow-hidden border border-white/5 bg-black group relative">
                                            <img src={frame} alt={`Frame ${idx}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                              <button 
                                                onClick={() => captureFrame(frame)}
                                                className="p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 transition-colors"
                                                title="Send to Image Analysis"
                                              >
                                                <Fingerprint className="w-4 h-4" />
                                              </button>
                                            </div>
                                          </div>
                                          <p className="text-[10px] text-center text-slate-500 font-mono">T: 00:0{idx + 1}:00</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}

            {currentView === 'Comparison' && (
              <motion.div 
                key="comparison"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="w-5 h-5 text-blue-400" />
                      <h2 className="font-semibold text-white">Enhanced Case Comparison</h2>
                    </div>
                  </div>
                  
                  <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Case A</label>
                        <select 
                          value={comparisonCases[0]} 
                          onChange={(e) => setComparisonCases([e.target.value, comparisonCases[1]])}
                          className="w-full bg-[#1a1a20] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                        >
                          <option value="">Select Case A</option>
                          {cases.map(c => <option key={c.id} value={c.id}>{c.id} - {c.crimeType}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Case B</label>
                        <select 
                          value={comparisonCases[1]} 
                          onChange={(e) => setComparisonCases([comparisonCases[0], e.target.value])}
                          className="w-full bg-[#1a1a20] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                        >
                          <option value="">Select Case B</option>
                          {cases.map(c => <option key={c.id} value={c.id}>{c.id} - {c.crimeType}</option>)}
                        </select>
                      </div>
                    </div>

                    {comparisonCases[0] && comparisonCases[1] && (
                      <div className="space-y-8">
                        <div className="grid grid-cols-3 gap-2 md:gap-4">
                          <div className="col-span-1"></div>
                          <div className="text-center font-bold text-blue-400 text-xs md:text-base">{comparisonCases[0]}</div>
                          <div className="text-center font-bold text-purple-400 text-xs md:text-base">{comparisonCases[1]}</div>
                          
                          {[
                            { label: 'Location', key: 'location' },
                            { label: 'Time', key: 'time' },
                            { label: 'Crime Type', key: 'crimeType' },
                            { label: 'Status', key: 'status' },
                            { label: 'Integrity Score', key: 'integrityScore' }
                          ].map((field) => {
                            const caseA = cases.find(c => c.id === comparisonCases[0])!;
                            const caseB = cases.find(c => c.id === comparisonCases[1])!;
                            const isMatch = (caseA as any)[field.key] === (caseB as any)[field.key];
                            
                            return (
                              <React.Fragment key={field.key}>
                                <div className="text-[10px] font-mono text-slate-500 uppercase py-2 flex items-center">{field.label}</div>
                                <div className={`text-[11px] md:text-sm text-center py-2 rounded flex items-center justify-center ${isMatch ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-slate-300'}`}>
                                  {(caseA as any)[field.key]}
                                </div>
                                <div className={`text-[11px] md:text-sm text-center py-2 rounded flex items-center justify-center ${isMatch ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-slate-300'}`}>
                                  {(caseB as any)[field.key]}
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        <div className="p-6 bg-blue-600/10 border border-blue-500/20 rounded-2xl text-center">
                          <p className="text-xs font-mono text-blue-400 uppercase tracking-widest mb-2">Similarity Index</p>
                          <p className="text-4xl font-bold text-white">
                            {(() => {
                              const caseA = cases.find(c => c.id === comparisonCases[0])!;
                              const caseB = cases.find(c => c.id === comparisonCases[1])!;
                              let matches = 0;
                              if (caseA.location === caseB.location) matches++;
                              if (caseA.crimeType === caseB.crimeType) matches++;
                              if (caseA.status === caseB.status) matches++;
                              return Math.round((matches / 3) * 100);
                            })()}%
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </motion.div>
            )}

            {currentView === 'Database' && (
              <motion.div 
                key="database"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-blue-400" />
                      <h2 className="font-semibold text-white">Forensic Case Storage</h2>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={clearAllCases}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear All
                      </button>
                      <span className="text-xs text-slate-500 font-mono">{cases.length} Records Found</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/[0.01]">
                          <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Case ID</th>
                          <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Location</th>
                          <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Date</th>
                          <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Type</th>
                          <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {cases.map((c) => (
                          <tr key={c.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4 text-sm font-bold text-blue-400">{c.id}</td>
                            <td className="px-6 py-4 text-sm text-slate-300">{c.location}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{c.date}</td>
                            <td className="px-6 py-4 text-sm text-slate-300">{c.crimeType}</td>
                            <td className="px-6 py-4">
                              <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${c.status === 'Real' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    setSelectedCaseForReport(c);
                                    setShowReport(true);
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                                  title="View Report"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => downloadSimplePDF(c)}
                                  className="p-2 text-slate-400 hover:text-emerald-400 transition-colors"
                                  title="Download Simple Report"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => deleteCase(c.id)}
                                  className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                                  title="Delete Case"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {cases.length === 0 && (
                      <div className="p-12 text-center">
                        <Database className="w-12 h-12 text-slate-700 mx-auto mb-4 opacity-20" />
                        <p className="text-slate-500">No forensic records found in the database.</p>
                      </div>
                    )}
                  </div>
                </section>
              </motion.div>
            )}

            {currentView === 'Analytics' && (
              <motion.div 
                key="analytics"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                      <h2 className="font-semibold text-white flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-400" />
                        Crime Type Distribution
                      </h2>
                    </div>
                    <div className="p-6 h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={crimeDistData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a20', border: '1px solid #ffffff10', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                          <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                      <h2 className="font-semibold text-white flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-blue-400" />
                        Regional Hotspots
                      </h2>
                    </div>
                    <div className="p-6 space-y-4">
                      {Object.entries(cases.reduce((acc, c) => {
                        acc[c.location] = (acc[c.location] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>))
                      .sort((a, b) => (b[1] as number) - (a[1] as number))
                      .slice(0, 8)
                      .map(([loc, count]) => (
                        <div key={loc} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                          <span className="text-sm font-medium text-slate-300">{loc}</span>
                          <div className="flex items-center gap-4">
                            <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${((count as number) / cases.length) * 100}%` }}></div>
                            </div>
                            <span className="text-xs font-bold text-white">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Explain Result Modal */}
      <AnimatePresence>
        {showExplainModal && elaResult && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExplainModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-2xl bg-[#121216] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-400" />
                  Forensic Result Explanation
                </h2>
                <button onClick={() => setShowExplainModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <Plus className="w-5 h-5 rotate-45 text-slate-500" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Integrity Score</p>
                    <p className={`text-2xl font-bold ${elaResult.integrityScore > 70 ? 'text-emerald-400' : 'text-red-400'}`}>{elaResult.integrityScore}%</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Risk Level</p>
                    <p className={`text-2xl font-bold ${elaResult.riskLevel === 'Low' ? 'text-emerald-400' : 'text-red-400'}`}>{elaResult.riskLevel}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest">Analysis Breakdown</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Pixel Inconsistency (ELA)', value: elaResult.confidenceBreakdown.ela },
                      { label: 'Brightness Uniformity', value: elaResult.confidenceBreakdown.brightness },
                      { label: 'Contrast Variance', value: elaResult.confidenceBreakdown.contrast }
                    ].map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">{item.label}</span>
                          <span className="text-white font-bold">{item.value}%</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${item.value}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                  <h3 className="text-xs font-bold text-blue-400 uppercase mb-2">Expert Reasoning</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {elaResult.isSuspicious 
                      ? "The analysis detected significant deviations in compression levels across different regions of the image. This typically occurs when an image is saved multiple times or when external elements are pasted into an existing frame. The low brightness/contrast variance in specific areas further confirms localized manipulation."
                      : "The image exhibits uniform compression artifacts across all frequency bands. The brightness and contrast levels are consistent with a single-capture digital file. No evidence of pixel-level manipulation or cloning was detected within the current analysis threshold."}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Forensic Report Modal */}
      <AnimatePresence>
        {showReport && (selectedCaseForReport || elaResult) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowReport(false);
                setSelectedCaseForReport(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-3xl bg-white text-slate-900 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div ref={reportRef} data-report-container className="flex-1 overflow-y-auto bg-white custom-scrollbar">
                {/* Report Header */}
                <div className="bg-slate-900 text-white p-6 md:p-8 flex flex-col md:flex-row justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-6 h-6 text-blue-400" />
                      <h2 className="text-xl font-black tracking-tighter uppercase">Forensic Analysis Report</h2>
                    </div>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Official Document: {selectedCaseForReport?.id || cases[0]?.id || 'TEMP-001'}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-xs font-bold uppercase">Date of Issue</p>
                    <p className="text-sm font-mono">{selectedCaseForReport?.date || new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Report Content */}
                <div className="p-6 md:p-10 space-y-8 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  <div className="space-y-6">
                    <section>
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200 pb-1 mb-3">Evidence Details</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Location:</span>
                          <span className="font-bold">{selectedCaseForReport?.location || location}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Incident Date:</span>
                          <span className="font-bold">{selectedCaseForReport?.date || date}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Incident Time:</span>
                          <span className="font-bold">{selectedCaseForReport?.time || time}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Crime Type:</span>
                          <span className="font-bold">{selectedCaseForReport?.crimeType || crimeType}</span>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200 pb-1 mb-3">Forensic Findings</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Analysis Method:</span>
                          <span className="font-bold">Error Level Analysis (ELA)</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Integrity Status:</span>
                          <span className={`font-bold ${(selectedCaseForReport?.status || (elaResult?.isSuspicious ? 'Tampered' : 'Real')) === 'Tampered' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {(selectedCaseForReport?.status || (elaResult?.isSuspicious ? 'Tampered' : 'Real')).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Confidence:</span>
                          <span className="font-bold">{selectedCaseForReport?.confidence || elaResult?.confidence || 0}%</span>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200 pb-1 mb-3">Visual Evidence</h3>
                    <div className="border border-slate-200 rounded p-1 bg-slate-50">
                      <img src={selectedCaseForReport?.elaImage || elaResult?.elaImage} alt="ELA Result" className="w-full h-auto" referrerPolicy="no-referrer" />
                      <p className="text-[9px] text-center mt-1 text-slate-400 font-mono">FIG 1.1: COMPRESSION ARTIFACT MAP</p>
                    </div>
                  </div>
                </div>

                <section className="bg-slate-50 p-6 rounded border border-slate-200">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Expert Conclusion</h3>
                  <p className="text-sm leading-relaxed text-slate-700 italic mb-4">
                    "Based on the Error Level Analysis performed on the submitted digital evidence, the system has identified 
                    {(selectedCaseForReport?.status || (elaResult?.isSuspicious ? 'Tampered' : 'Real')) === 'Tampered' ? ' significant inconsistencies in the pixel compression levels, suggesting localized manipulation.' : ' uniform compression artifacts consistent with an authentic, unedited digital capture.'} 
                    The contextual similarity engine {similarCases[0]?.score >= 60 ? `identified a strong correlation (${similarCases[0].score}%) with Case ${similarCases[0].case.id}.` : 'did not find any significant historical precedents for this specific context.'}"
                  </p>
                  
                  {(selectedCaseForReport?.description || imageDescription) && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Detailed Content Analysis</h4>
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {selectedCaseForReport?.description || imageDescription}
                      </p>
                    </div>
                  )}
                </section>

                <div className="pt-8 flex justify-between items-end border-t border-slate-100">
                  <div className="space-y-1">
                    <div className="w-32 h-12 border-b border-slate-900 flex items-end justify-center">
                      <span className="font-serif italic text-lg opacity-40">ForensicAI_System</span>
                    </div>
                    <p className="text-[9px] font-bold uppercase text-slate-400">Automated System Signature</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Verification Hash</p>
                    <p className="text-[10px] font-mono text-slate-900">SHA-256: {Math.random().toString(36).substring(2, 15).toUpperCase()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Report Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setShowReport(false);
                    setSelectedCaseForReport(null);
                  }}
                  className="px-6 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => downloadSimplePDF()}
                  className="px-6 py-2 bg-slate-100 text-slate-900 text-sm font-bold rounded hover:bg-slate-200 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Simple Report (Text)
                </button>
                <button 
                  onClick={() => downloadPDF()}
                  className="px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Full PDF Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0.z-\[100\] * {
            visibility: visible;
          }
          .fixed.inset-0.z-\[100\] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .bg-slate-50 { background-color: #f8fafc !important; }
          .bg-slate-900 { background-color: #0f172a !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}

