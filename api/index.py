import os
import base64
import io
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from gtts import gTTS
import google.generativeai as genai
from PIL import Image

# --- Initial Configuration ---
app = Flask(__name__)

# Enable CORS for all routes
CORS(app, origins=['*'], methods=['GET', 'POST', 'OPTIONS'], allow_headers=['Content-Type'])

# Configure Gemini API
def configure_gemini():
    
    api_key = 'GEMINI_API_KEY'

    genai.configure(api_key=api_key)
    return genai.GenerativeModel('gemini-1.5-flash')

def get_scene_description(image_bytes)
    try:
        # Configure Gemini
        model = configure_gemini()

        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(image_bytes))

        # Create prompt for scene description
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

        # Generate description using Gemini
        response = model.generate_content([prompt, image])

        if response.text:
            return response.text.strip()
        else:
            return "I can see an image but cannot provide a detailed description at this time."

    except Exception as e:
        print(f"Error in get_scene_description: {e}")
        return None

# --- API Endpoint for Vision and TTS ---
@app.route('/speak_description', methods=['POST', 'OPTIONS'])
def speak_description():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    # 1. Check for image data in the request
    if 'image' not in request.json:
        return jsonify({"error": "No image data provided."}), 400

    image_data_b64 = request.json['image']

    try:
        # 2. Handle data URL format (data:image/jpeg;base64,...)
        if image_data_b64.startswith('data:'):
            # Remove the data URL prefix
            image_data_b64 = image_data_b64.split(',')[1]

        # Decode the Base64 string back into raw bytes
        image_bytes = base64.b64decode(image_data_b64)

        # 3. Get the text description from Gemini
        description = get_scene_description(image_bytes)

        if description is None:
            return jsonify({"error": "An internal server error occurred while getting the description."}), 500

        print(f"Generated description: {description}")

        # 4. Convert the text to an in-memory audio file using gTTS
        tts = gTTS(text=description, lang='en')
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0) # Rewind the buffer to the beginning

        # 5. Return the audio file to the frontend
        response = send_file(
            audio_buffer,
            mimetype="audio/mpeg",
            as_attachment=True,
            download_name="description.mp3"
        )
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response

    except base64.binascii.Error:
        return jsonify({"error": "Invalid Base64 string. Could not decode image."}), 400
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"error": f"An internal server error occurred: {str(e)}"}), 500

@app.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    """Health check endpoint"""
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        return response

    response = jsonify({"status": "healthy", "message": "Gemini Vision API is running"})
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
    return response

if __name__ == '__main__':
    print("Starting Gemini Vision API server...")

    # Run the server on your local network, accessible to your phone
    app.run(host='0.0.0.0', port=5000, debug=True)
