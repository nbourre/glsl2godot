uniform float uTime;
varying vec2 vUv;
varying vec3 vNormal;
varying float vElevation;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    float elevation = sin(modelPosition.x * 4.0 + uTime) * 0.1;
    modelPosition.y += elevation;
    vElevation = elevation;
    gl_Position = projectionMatrix * viewMatrix * modelPosition;
}
