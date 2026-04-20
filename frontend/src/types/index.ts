export interface User {
  id: number
  name: string
  email: string
  grade: number
}

export interface AuthToken {
  access_token: string
  token_type: string
  user: User
}

export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatSession {
  id: number
  created_at: string
  messages: Message[]
}

export interface AnswerBlock {
  type: 'text' | 'image'
  content?: string
  url?: string
}

export interface Question {
  id: number
  content: string
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  question_type: 'multiple_choice' | 'true_false' | 'fill_in'
  has_image: boolean
  source_image_url: string | null
  created_at: string
  last_used_at: string | null
  review_count: number
  next_review_at?: string | null
  interval_days?: number | null
  source_exam_id: number
  answer_blocks?: AnswerBlock[] | null
}

export interface SourceExam {
  id: number
  title: string
  image_url: string | null
  uploaded_at: string
  questions: Question[]
}

export interface ReviewExam {
  id: number
  title: string
  created_at: string
  questions: Question[]
}

export interface QuestionSet {
  id: number
  folder_id: number
  name: string
  created_at: string
  questions: Question[]
}

export interface Folder {
  id: number
  name: string
  created_at: string
  question_sets: QuestionSet[]
}

// ── Notebook Types ───────────────────────────────

export interface NotebookSource {
  id: number
  source_type: 'pdf' | 'web' | 'youtube'
  title: string
  url?: string
  chunk_count: number
  created_at: string
}

export interface NotebookMindmap {
  id: number
  title: string
  data: any // JSON structure for ReactFlow
}

export interface Notebook {
  id: number
  title: string
  created_at: string
  sources: NotebookSource[]
  mindmaps?: NotebookMindmap[]
}

