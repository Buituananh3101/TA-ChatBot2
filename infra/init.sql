CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(150) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  grade      INT DEFAULT 10,
  created_at DATETIME DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_exams (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  title       VARCHAR(200),
  image_url   TEXT,
  uploaded_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  source_exam_id INT NOT NULL,
  user_id        INT NOT NULL,
  content        TEXT NOT NULL,
  topic          VARCHAR(100),
  difficulty     ENUM('easy','medium','hard') DEFAULT 'medium',
  chroma_id      VARCHAR(100),
  last_used_at   DATETIME,
  created_at     DATETIME DEFAULT NOW(),
  FOREIGN KEY (source_exam_id) REFERENCES source_exams(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS review_exams (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(200),
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS review_exam_questions (
  review_exam_id INT NOT NULL,
  question_id    INT NOT NULL,
  order_num      INT,
  PRIMARY KEY (review_exam_id, question_id),
  FOREIGN KEY (review_exam_id) REFERENCES review_exams(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  role       ENUM('user','assistant') NOT NULL,
  content    TEXT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
