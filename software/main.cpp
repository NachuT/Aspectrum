#include <emscripten.h>
#include <emscripten/bind.h>
#include <vector>
#include <algorithm>
#include <cmath>

// Color correction algorithm implementation in C++
class ColorCorrector {
private:
    float hueShift;
    float contrast;
    float brightness;
    float saturationBoost;
    
    // Convert RGB to HSV
    void rgbToHsv(float r, float g, float b, float& h, float& s, float& v) {
        float maxVal = std::max({r, g, b});
        float minVal = std::min({r, g, b});
        float delta = maxVal - minVal;
        
        // Value
        v = maxVal;
        
        // Saturation
        if (maxVal == 0) {
            s = 0;
        } else {
            s = delta / maxVal;
        }
        
        // Hue
        if (delta == 0) {
            h = 0;
        } else if (maxVal == r) {
            h = 60 * fmod(((g - b) / delta), 6);
        } else if (maxVal == g) {
            h = 60 * ((b - r) / delta + 2);
        } else {
            h = 60 * ((r - g) / delta + 4);
        }
        
        if (h < 0) h += 360;
        h /= 360.0f; // Normalize to 0-1
    }
    
    // Convert HSV to RGB
    void hsvToRgb(float h, float s, float v, float& r, float& g, float& b) {
        h *= 360.0f; // Convert back to 0-360
        
        float c = v * s;
        float x = c * (1 - std::abs(fmod(h / 60.0f, 2) - 1));
        float m = v - c;
        
        float r1, g1, b1;
        
        if (h >= 0 && h < 60) {
            r1 = c; g1 = x; b1 = 0;
        } else if (h >= 60 && h < 120) {
            r1 = x; g1 = c; b1 = 0;
        } else if (h >= 120 && h < 180) {
            r1 = 0; g1 = c; b1 = x;
        } else if (h >= 180 && h < 240) {
            r1 = 0; g1 = x; b1 = c;
        } else if (h >= 240 && h < 300) {
            r1 = x; g1 = 0; b1 = c;
        } else {
            r1 = c; g1 = 0; b1 = x;
        }
        
        r = r1 + m;
        g = g1 + m;
        b = b1 + m;
    }

public:
    ColorCorrector() : hueShift(0.4f), contrast(2.0f), brightness(0.05f), saturationBoost(1.3f) {}
    
    // Process image data (RGBA format)
    void processImage(std::vector<uint8_t>& imageData, int width, int height) {
        for (int i = 0; i < width * height; i++) {
            int pixelIndex = i * 4;
            
            // Get RGB values (0-255)
            float r = imageData[pixelIndex] / 255.0f;
            float g = imageData[pixelIndex + 1] / 255.0f;
            float b = imageData[pixelIndex + 2] / 255.0f;
            
            // Convert to HSV
            float h, s, v;
            rgbToHsv(r, g, b, h, s, v);
            
            // Skip low saturation pixels for noise reduction
            if (s < 0.1f) continue;
            
            // Apply hue shift
            h += hueShift;
            
            // Apply Algorithm 4 conditions
            if (h > 1.0f) h = 1.0f - h;
            if (h < 0.0f) h = 0.0f;
            h = std::clamp(h, 0.0f, 0.9f);
            
            // Apply saturation boost
            s *= saturationBoost;
            s = std::clamp(s, 0.0f, 1.0f);
            
            // Convert back to RGB
            hsvToRgb(h, s, v, r, g, b);
            
            // Apply contrast and brightness
            r = (r - 0.5f) * contrast + 0.5f + brightness;
            g = (g - 0.5f) * contrast + 0.5f + brightness;
            b = (b - 0.5f) * contrast + 0.5f + brightness;
            
            // Clamp values
            r = std::clamp(r, 0.0f, 1.0f);
            g = std::clamp(g, 0.0f, 1.0f);
            b = std::clamp(b, 0.0f, 1.0f);
            
            // Set processed values back
            imageData[pixelIndex] = static_cast<uint8_t>(r * 255);
            imageData[pixelIndex + 1] = static_cast<uint8_t>(g * 255);
            imageData[pixelIndex + 2] = static_cast<uint8_t>(b * 255);
            // Alpha channel remains unchanged
        }
    }
    
    // Set parameters
    void setHueShift(float shift) { hueShift = shift; }
    void setContrast(float c) { contrast = c; }
    void setBrightness(float b) { brightness = b; }
    void setSaturationBoost(float s) { saturationBoost = s; }
};

// Global instance
ColorCorrector corrector;

// Exported functions for JavaScript
extern "C" {
    EMSCRIPTEN_KEEPALIVE
    void processImageData(uint8_t* data, int width, int height) {
        std::vector<uint8_t> imageData(data, data + width * height * 4);
        corrector.processImage(imageData, width, height);
        
        // Copy processed data back
        for (int i = 0; i < width * height * 4; i++) {
            data[i] = imageData[i];
        }
    }
    
    EMSCRIPTEN_KEEPALIVE
    void setHueShift(float shift) {
        corrector.setHueShift(shift);
    }
    
    EMSCRIPTEN_KEEPALIVE
    void setContrast(float contrast) {
        corrector.setContrast(contrast);
    }
    
    EMSCRIPTEN_KEEPALIVE
    void setBrightness(float brightness) {
        corrector.setBrightness(brightness);
    }
    
    EMSCRIPTEN_KEEPALIVE
    void setSaturationBoost(float boost) {
        corrector.setSaturationBoost(boost);
    }
}

// Emscripten bindings
using namespace emscripten;

EMSCRIPTEN_BINDINGS(color_correction) {
    class_<ColorCorrector>("ColorCorrector")
        .constructor<>()
        .function("processImage", &ColorCorrector::processImage)
        .function("setHueShift", &ColorCorrector::setHueShift)
        .function("setContrast", &ColorCorrector::setContrast)
        .function("setBrightness", &ColorCorrector::setBrightness)
        .function("setSaturationBoost", &ColorCorrector::setSaturationBoost);
}
