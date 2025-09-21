from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import base64
import io
import json
from gtts import gTTS
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)
CORS(app, origins=['*'], methods=['GET', 'POST', 'OPTIONS'], allow_headers=['Content-Type'])

# Configure Gemini API
def configure_gemini():
    api_key = 'AIzaSyAiWnne4RkGzK6RQpZpcJ1SM6cidVJE-vg'
    genai.configure(api_key=api_key)
    return genai.GenerativeModel('gemini-1.5-flash')

def get_scene_description(image_bytes):
    try:
        model = configure_gemini()
        image = Image.open(io.BytesIO(image_bytes))
        
        prompt = """
        Describe this scene in detail, focusing on:
        - What objects, people, or text you can see
        - The layout and arrangement of elements
        - Any text that appears in the image
        - Colors and visual characteristics
        - The overall context or setting
        
        Be specific and helpful for someone who cannot see the image clearly.
        Keep the description concise but informative (1-2 sentences).
        """
        
        response = model.generate_content([prompt, image])
        
        if response.text:
            return response.text.strip()
        else:
            return "I can see an image but cannot provide a detailed description at this time."
            
    except Exception as e:
        print(f"Error in get_scene_description: {e}")
        return None

# HTMX endpoint for processing frames
@app.route('/api/process-frame', methods=['POST'])
def process_frame():
    """HTMX endpoint for processing camera frames"""
    try:
        # Get image data from request
        data = request.get_json()
        if not data or 'image' not in data:
            return render_template_string('<div class="error">No image data provided</div>'), 400
        
        image_data_b64 = data['image']
        
        # Handle data URL format
        if image_data_b64.startswith('data:'):
            image_data_b64 = image_data_b64.split(',')[1]
        
        # Decode image
        image_bytes = base64.b64decode(image_data_b64)
        
        # Get description
        description = get_scene_description(image_bytes)
        
        if description is None:
            return render_template_string('<div class="error">Failed to process image</div>'), 500
        
        # Convert to speech
        tts = gTTS(text=description, lang='en')
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        
        # Return HTMX response with audio
        return render_template_string('''
        <div class="success">
            <p>Description: {{ description }}</p>
            <audio controls autoplay>
                <source src="data:audio/mpeg;base64,{{ audio_data }}" type="audio/mpeg">
            </audio>
        </div>
        ''', description=description, audio_data=base64.b64encode(audio_buffer.getvalue()).decode())
        
    except Exception as e:
        print(f"Error processing frame: {e}")
        return render_template_string('<div class="error">Processing failed: {{ error }}</div>', error=str(e)), 500

# Regular API endpoint for non-HTMX requests
@app.route('/speak_description', methods=['POST', 'OPTIONS'])
def speak_description():
    """Regular API endpoint for audio descriptions"""
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    try:
        data = request.get_json()
        if 'image' not in data:
            return jsonify({"error": "No image data provided."}), 400

        image_data_b64 = data['image']
        
        if image_data_b64.startswith('data:'):
            image_data_b64 = image_data_b64.split(',')[1]
        
        image_bytes = base64.b64decode(image_data_b64)
        description = get_scene_description(image_bytes)
        
        if description is None:
            return jsonify({"error": "Failed to process image"}), 500

        tts = gTTS(text=description, lang='en')
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        
        response = jsonify({
            "description": description,
            "audio": base64.b64encode(audio_buffer.getvalue()).decode()
        })
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        return response
    
    response = jsonify({"status": "healthy", "message": "High-Performance VR API is running"})
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
    return response

if __name__ == '__main__':
    print("Starting High-Performance VR API server...")
    app.run(host='0.0.0.0', port=5000, debug=True)
