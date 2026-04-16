CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(150) UNIQUE NOT NULL,
  password        VARCHAR(255) NOT NULL,
  grade           INT DEFAULT 10,
  created_at      DATETIME DEFAULT NOW(),
  messenger_psid  VARCHAR(50) NULL UNIQUE,
  INDEX idx_users_email (email),
  INDEX idx_users_psid (messenger_psid)
);

CREATE TABLE IF NOT EXISTS source_exams (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  title       VARCHAR(200),
  image_url   TEXT,
  created_at  DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  source_exam_id INT NOT NULL,
  user_id        INT NOT NULL,
  content        TEXT NOT NULL,
  topic          VARCHAR(100),
  difficulty     ENUM('easy','medium','hard') DEFAULT 'medium',
  has_image      BOOLEAN DEFAULT FALSE,
  chroma_id      VARCHAR(100),
  last_used_at   DATETIME NULL,
  review_count   INT DEFAULT 0 NOT NULL,
  next_review_at DATETIME NULL,
  interval_days  INT DEFAULT 1,
  ease_factor    FLOAT DEFAULT 2.5,
  created_at     DATETIME DEFAULT NOW(),
  FOREIGN KEY (source_exam_id) REFERENCES source_exams(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS folders (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  name       VARCHAR(200) NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_sets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  folder_id  INT NOT NULL,
  name       VARCHAR(200) NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_set_items (
  question_set_id INT NOT NULL,
  question_id     INT NOT NULL UNIQUE,
  PRIMARY KEY (question_set_id, question_id),
  FOREIGN KEY (question_set_id) REFERENCES question_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT uq_question_set_items_question UNIQUE (question_id)
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

CREATE TABLE IF NOT EXISTS study_sessions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  started_at       DATETIME DEFAULT NOW(),
  ended_at         DATETIME NULL,
  duration_seconds INT NULL,
  page             VARCHAR(50) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  channel         VARCHAR(20) DEFAULT 'messenger',
  status          VARCHAR(20) NOT NULL,
  message_preview TEXT,
  error_detail    TEXT NULL,
  created_at      DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_notif_user (user_id),
  INDEX idx_notif_created (created_at)
);
