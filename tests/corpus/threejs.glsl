uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;
varying vec3 vNormal;
varying float vElevation;

void main() {
    float mixStrength = (vElevation + 0.1) * 5.0;
    vec3 color = mix(uColorA, uColorB, mixStrength);
    float light = dot(vNormal, normalize(vec3(1, 1, 1))) * 0.5 + 0.5;
    gl_FragColor = vec4(color * light, 1.0);
}
