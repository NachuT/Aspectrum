
import './App.css';

function App() {
  return (
    <div className="product-container">
      <header className="product-header">
        <h1 className="product-title">Aspectrum</h1>
        <p className="product-tagline">A simple, bold product for modern needs</p>
      </header>
      <main>
        <div className="product-image-wrapper">
          <img src={process.env.PUBLIC_URL + '/assets/product-image.jpg'} alt="Product" className="product-image" />
        </div>
        <div className="product-info">
          <p>Aspectrum is designed to assist the blind and the colorblind in navigating their surroundings with VR, AI, and algorithms.</p>
        </div>
        <div className="product-links">
          <a href="https://nachut.github.io/testpenn/" className="btn btn-yellow">Try Now</a>
          <a href="#demo" className="btn btn-black">Demo Video</a>
        </div>
      </main>
      <footer className="product-footer">
        <p>&copy; By Nachu and Vijayesh</p>
      </footer>
    </div>
  );
}

export default App;
