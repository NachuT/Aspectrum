#!/bin/bash

# Build script for compiling C++ to WebAssembly

echo "🚀 Building WebAssembly module for color correction..."

# Check if Emscripten is installed
if ! command -v emcc &> /dev/null; then
    echo "❌ Emscripten not found. Installing..."
    
    # Install Emscripten
    git clone https://github.com/emscripten-core/emsdk.git
    cd emsdk
    ./emsdk install latest
    ./emsdk activate latest
    source ./emsdk_env.sh
    cd ..
    
    echo "✅ Emscripten installed successfully"
fi

# Compile C++ to WebAssembly
echo "🔨 Compiling color_correction.cpp to WebAssembly..."

emcc color_correction.cpp \
    -O3 \
    -s WASM=1 \
    -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
    -s EXPORTED_FUNCTIONS='["_processImageData", "_setHueShift", "_setContrast", "_setBrightness", "_setSaturationBoost"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME='ColorCorrectionModule' \
    -s USE_ES6_IMPORT_META=0 \
    -s NO_EXIT_RUNTIME=1 \
    -s ASSERTIONS=0 \
    -o color_correction.js

if [ $? -eq 0 ]; then
    echo "✅ WebAssembly module built successfully!"
    echo "📁 Generated files:"
    echo "   - color_correction.js"
    echo "   - color_correction.wasm"
    echo ""
    echo "🎯 Next steps:"
    echo "   1. Open index_htmx.html in your browser"
    echo "   2. Start the Flask server: python app_htmx.py"
    echo "   3. Test the high-performance VR app!"
else
    echo "❌ Build failed!"
    exit 1
fi
