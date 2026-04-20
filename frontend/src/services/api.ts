import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────
export const authAPI = {
  register: (data: { name: string; email: string; password: string; grade: number }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

// ── Chat ──────────────────────────────────────────
export const chatAPI = {
  createSession: () => api.post('/chat/sessions'),
  listSessions: () => api.get('/chat/sessions'),
  getSession: (id: number) => api.get(`/chat/sessions/${id}`),
  sendMessage: (sessionId: number, message: string) =>
    api.post(`/chat/sessions/${sessionId}/messages`, { message }),
}

// ── Upload ────────────────────────────────────────
export const uploadAPI = {
  uploadExamImage: (file: File, title?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (title) form.append('title', title)
    return api.post('/upload/exam-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const problemsAPI = {
  listExams: () => api.get('/problems/exams'),
  getExam: (id: number) => api.get(`/problems/exams/${id}`),
  deleteExam: (id: number) => api.delete(`/problems/exams/${id}`),
  updateExam: (id: number, data: { title: string }) => api.put(`/problems/exams/${id}`, data),
  updateQuestion: (id: number, data: { topic: string; difficulty: string }) => api.put(`/problems/questions/${id}`, data),
  updateAnswerBlocks: (id: number, blocks: any[]) => api.put(`/problems/questions/${id}/answer-blocks`, { blocks }),
  uploadAnswerImage: (questionId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/problems/questions/${questionId}/answer-image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// ── Review ────────────────────────────────────────
export const reviewAPI = {
  generate: (topics: string[], numQuestions: number) =>
    api.post('/review/generate', { topics, num_questions: numQuestions }),
  listExams: () => api.get('/review/exams'),
  getExam: (id: number) => api.get(`/review/exams/${id}`),
  deleteExam: (id: number) => api.delete(`/review/exams/${id}`),
  getNeedsReview: (days: number) => api.get('/review/needs-review', { params: { days } }),
  // FIX: thêm tham số quality (0-5), mặc định 3
  markQuestionReviewed: (questionId: number, quality: number = 3) =>
    api.post(`/review/questions/${questionId}/mark-reviewed`, { quality }),
}

// ── Library ───────────────────────────────────────────
export const libraryAPI = {
  listFolders: () => api.get('/library/folders'),
  createFolder: (name: string) => api.post('/library/folders', { name }),
  renameFolder: (id: number, name: string) => api.patch(`/library/folders/${id}`, { name }),
  deleteFolder: (id: number) => api.delete(`/library/folders/${id}`),

  listSets: (folderId: number) => api.get(`/library/folders/${folderId}/sets`),
  createSet: (folderId: number, name: string) => api.post(`/library/folders/${folderId}/sets`, { name }),
  renameSet: (setId: number, name: string) => api.patch(`/library/sets/${setId}`, { name }),
  deleteSet: (setId: number) => api.delete(`/library/sets/${setId}`),

  listSetQuestions: (setId: number) => api.get(`/library/sets/${setId}/questions`),
  addQuestion: (setId: number, questionId: number) => api.post(`/library/sets/${setId}/questions`, { question_id: questionId }),
  removeQuestion: (setId: number, questionId: number) => api.delete(`/library/sets/${setId}/questions/${questionId}`),
}

// ── Messenger Integration ─────────────────────────────
export const messengerAPI = {
  getStatus: () => api.get('/auth/messenger-status'),
  unlink: () => api.post('/auth/unlink-messenger'),
}

// ── Notebook ──────────────────────────────────────────
export const notebookAPI = {
  listNotebooks: () => api.get('/notebook/'),
  createNotebook: (title: string) => api.post('/notebook/', { title }),
  getNotebook: (id: number) => api.get(`/notebook/${id}`),
  renameNotebook: (id: number, title: string) => api.patch(`/notebook/${id}`, { title }),
  deleteNotebook: (id: number) => api.delete(`/notebook/${id}`),

  addPdfSource: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/notebook/${id}/sources/pdf`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  addUrlSource: (id: number, url: string) => api.post(`/notebook/${id}/sources/url`, { url }),
  deleteSource: (id: number, sourceId: number) => api.delete(`/notebook/${id}/sources/${sourceId}`),

  getMessages: (id: number) => api.get(`/notebook/${id}/messages`),
  sendChat: (id: number, message: string, activeSources?: number[]) => api.post(`/notebook/${id}/chat`, { message, active_sources: activeSources }),

  generateMindmap: (id: number, title: string) => api.post(`/notebook/${id}/mindmaps/generate`, { title }),
  updateMindmap: (id: number, mmId: number, data: any) => api.put(`/notebook/${id}/mindmaps/${mmId}`, { data }),
  deleteMindmap: (id: number, mmId: number) => api.delete(`/notebook/${id}/mindmaps/${mmId}`),
}

export default api