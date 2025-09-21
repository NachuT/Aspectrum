import numpy as np
import cv2
import colorsys


img = cv2.imread('img.jpeg')
rgb_array = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


hsv_array = np.zeros_like(rgb_array, dtype=np.float32)

for i, row in enumerate(rgb_array):
    for j, element in enumerate(row):
        r, g, b = element
        h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
        hsv_array[i][j] = [h, s, v]


h = 0.4  
hsv_array[:, :, 0] = hsv_array[:, :, 0] + h




mask1 = hsv_array[:, :, 0] > 1
hsv_array[mask1, 0] = 1 - hsv_array[mask1, 0]


mask2 = hsv_array[:, :, 0] < 0
hsv_array[mask2, 0] = 0


hsv_array[:, :, 0] = np.clip(hsv_array[:, :, 0], 0, 0.9)


rgb_corrected = np.zeros_like(rgb_array, dtype=np.uint8)

for i, row in enumerate(hsv_array):
    for j, element in enumerate(row):
        h, s, v = element
        r, g, b = colorsys.hsv_to_rgb(h, s, v)
        rgb_corrected[i][j] = [int(r*255), int(g*255), int(b*255)]

bgr_corrected = cv2.cvtColor(rgb_corrected, cv2.COLOR_RGB2BGR)
cv2.imwrite('img_corrected.jpg', bgr_corrected)

print("Algorithm 4: Shifting Color completed!")
print(f"Hue shift value (h): {h}")
print("Output saved as 'img_corrected.jpg'")
