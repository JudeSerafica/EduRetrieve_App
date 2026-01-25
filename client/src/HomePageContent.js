import { Link } from "react-router-dom"

function HomePageContent() {

  return (
    <>
      <nav className="homepage-nav">
        <div className="homepage-logo">EDURETRIEVE</div>
        <div className="homepage-nav-buttons">
          <Link to="/login" className="homepage-login-btn">
            Sign In
          </Link>
          <Link to="/signup" className="homepage-signup-btn">
            Sign Up
          </Link>
        </div>
      </nav>

      <div className="homepage-container">
        <h1 className="homepage-heading">Learn Smarter with EduRetrieve AI</h1>
        <p className="homepage-paragraph">
          Upload your study materials and chat with AI to get instant answers, summaries, and personalized learning
          insights.
        </p>

        <div className="homepage-scroll-indicator">↓</div>

        <Link to="/login" className="homepage-cta-button">
          Get started
          <span>→</span>
        </Link>
      </div>

      <section className="homepage-features-section">
        <h2 className="homepage-features-heading">Key Features</h2>
        <div className="homepage-features-grid">
          <div className="homepage-feature-card">
            <div className="homepage-feature-icon">📚</div>
            <h3 className="homepage-feature-title">AI-Powered Chat</h3>
            <p className="homepage-feature-description">
              Engage in intelligent conversations with our AI to get answers, explanations, and insights from your uploaded materials.
            </p>
          </div>
          <div className="homepage-feature-card">
            <div className="homepage-feature-icon">📄</div>
            <h3 className="homepage-feature-title">File Upload Support</h3>
            <p className="homepage-feature-description">
              Upload PDFs, documents, and other study materials to create a personalized knowledge base for learning.
            </p>
          </div>
          <div className="homepage-feature-card">
            <div className="homepage-feature-icon">📊</div>
            <h3 className="homepage-feature-title">Progress Analytics</h3>
            <p className="homepage-feature-description">
              Track your learning progress with detailed analytics and insights to optimize your study habits.
            </p>
          </div>
          <div className="homepage-feature-card">
            <div className="homepage-feature-icon">💾</div>
            <h3 className="homepage-feature-title">Save Important Chats</h3>
            <p className="homepage-feature-description">
              Save and organize your most valuable conversations and study sessions for easy reference later.
            </p>
          </div>
          <div className="homepage-feature-card">
            <div className="homepage-feature-icon">🔍</div>
            <h3 className="homepage-feature-title">Smart Search</h3>
            <p className="homepage-feature-description">
              Quickly find information across all your uploaded materials with our advanced search capabilities.
            </p>
          </div>
          <div className="homepage-feature-card">
            <div className="homepage-feature-icon">🎯</div>
            <h3 className="homepage-feature-title">Personalized Learning</h3>
            <p className="homepage-feature-description">
              Receive tailored recommendations and study suggestions based on your learning patterns and goals.
            </p>
          </div>
        </div>
      </section>

      <section className="homepage-how-it-works-section">
        <h2 className="homepage-how-it-works-heading">How It Works</h2>
        <div className="homepage-steps-container">
          <div className="homepage-step">
            <div className="homepage-step-number">1</div>
            <div className="homepage-step-content">
              <h3 className="homepage-step-title">Sign Up & Upload</h3>
              <p className="homepage-step-description">
                Create your account and upload your study materials including PDFs, notes, and documents.
              </p>
            </div>
          </div>
          <div className="homepage-step">
            <div className="homepage-step-number">2</div>
            <div className="homepage-step-content">
              <h3 className="homepage-step-title">Chat with AI</h3>
              <p className="homepage-step-description">
                Ask questions, request summaries, or seek explanations about your uploaded content through our AI chat interface.
              </p>
            </div>
          </div>
          <div className="homepage-step">
            <div className="homepage-step-number">3</div>
            <div className="homepage-step-content">
              <h3 className="homepage-step-title">Learn & Track Progress</h3>
              <p className="homepage-step-description">
                Review insights, save important information, and monitor your learning progress with detailed analytics.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="homepage-footer">
        <p>&copy; 2025 EduRetrieve. All rights reserved.</p>
      </footer>
    </>
  )
}

export default HomePageContent