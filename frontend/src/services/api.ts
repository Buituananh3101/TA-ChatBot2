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

// ── Problems ──────────────────────────────────────
export const problemsAPI = {
  listExams: () => api.get('/problems/exams'),
  getExam: (id: number) => api.get(`/problems/exams/${id}`),
  deleteExam: (id: number) => api.delete(`/problems/exams/${id}`),
  updateExam: (id: number, data: { title: string }) => api.put(`/problems/exams/${id}`, data),
  updateQuestion: (id: number, data: { topic: string; difficulty: string }) => api.put(`/problems/questions/${id}`, data),
}

// ── Review ────────────────────────────────────────
export const reviewAPI = {
  generate: (topics: string[], numQuestions: number) =>
    api.post('/review/generate', { topics, num_questions: numQuestions }),
  listExams: () => api.get('/review/exams'),
  getExam: (id: number) => api.get(`/review/exams/${id}`),
  deleteExam: (id: number) => api.delete(`/review/exams/${id}`),
  getNeedsReview: (days: number) => api.get('/review/needs-review', { params: { days } }),
  markQuestionReviewed: (questionId: number) => api.post(`/review/questions/${questionId}/mark-reviewed`),
}

// ── Library ───────────────────────────────────────────
export const libraryAPI = {
  // Folders
  listFolders: () => api.get('/library/folders'),
  createFolder: (name: string) => api.post('/library/folders', { name }),
  renameFolder: (id: number, name: string) => api.patch(`/library/folders/${id}`, { name }),
  deleteFolder: (id: number) => api.delete(`/library/folders/${id}`),

  // Question Sets
  listSets: (folderId: number) => api.get(`/library/folders/${folderId}/sets`),
  createSet: (folderId: number, name: string) => api.post(`/library/folders/${folderId}/sets`, { name }),
  renameSet: (setId: number, name: string) => api.patch(`/library/sets/${setId}`, { name }),
  deleteSet: (setId: number) => api.delete(`/library/sets/${setId}`),

  // Questions in Set
  listSetQuestions: (setId: number) => api.get(`/library/sets/${setId}/questions`),
  addQuestion: (setId: number, questionId: number) => api.post(`/library/sets/${setId}/questions`, { question_id: questionId }),
  removeQuestion: (setId: number, questionId: number) => api.delete(`/library/sets/${setId}/questions/${questionId}`),
}

export default api
