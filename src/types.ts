export type CrimeType = 'Gun' | 'Knife' | 'Assault' | 'Suicide' | 'Accident';
export type Location = 
  | 'Anantapuramu' 
  | 'Sri Sathya Sai' 
  | 'Annamayya' 
  | 'Chittoor' 
  | 'Tirupati' 
  | 'YSR Kadapa' 
  | 'Nandyal' 
  | 'Kurnool' 
  | 'Alluri Sitharama Raju' 
  | 'Anakapalli' 
  | 'Visakhapatnam' 
  | 'Parvathipuram Manyam' 
  | 'Vizianagaram' 
  | 'Srikakulam' 
  | 'Dr. B.R. Ambedkar Konaseema' 
  | 'East Godavari' 
  | 'Kakinada' 
  | 'Eluru' 
  | 'West Godavari' 
  | 'NTR' 
  | 'Krishna' 
  | 'Palnadu' 
  | 'Guntur' 
  | 'Bapatla' 
  | 'Prakasam' 
  | 'Sri Potti Sriramulu Nellore';

export interface ForensicCase {
  id: string;
  location: Location;
  time: string;
  crimeType: CrimeType;
  status: 'Real' | 'Tampered';
  date: string;
  confidence: number;
  description?: string;
  elaImage?: string;
  integrityScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  confidenceBreakdown: {
    ela: number;
    brightness: number;
    contrast: number;
  };
  metadata?: {
    resolution: string;
    format: string;
    size: string;
  };
  chainOfCustody: {
    createdTime: string;
    analysisTime: string;
    actions: string[];
  };
  createdAt?: any;
}

export interface SimilarityResult {
  case: ForensicCase;
  score: number;
}
