export interface EconsentForm {
  form_number: string;
  title: string;
  pages: number[];
  jurisdiction: string;
}

export interface AnalysisData {
  client: { name: string | null };
  cpa_firm: { name: string | null; sharefile_subdomain: string | null };
  tax_year: string | null;
  return_type: string | null;
  tax_summary: {
    federal_sentence: string | null;
    state_sentences: Array<{
      state_name: string;
      state_abbreviation: string;
      sentence: string;
    }>;
  };
  estimated_payments: Array<{
    date: string;
    federal: number;
    state: number;
    state_name: string | null;
  }>;
  pte_payments: Array<{ sentence: string }>;
  econsent_pages: number[];
  econsent_forms: EconsentForm[];
}

export interface ProcessResponse {
  econsent_pdf_b64: string | null;
  analysis_data: AnalysisData;
  email_html: string;
}
