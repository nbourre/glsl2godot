// Common
#define S(a, b, t) smoothstep(a, b, t)
#define N 8

struct Ray { vec3 o, d; };
const vec3 PAL[3] = vec3[3](vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1));
const mat3 ID = mat3(1, 0, 0, 0, 1, 0, 0, 0, 1);

vec2 g_uv;
float g_seed = 0.;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash(vec2 p) { return hash(dot(p, vec2(12.9898, 78.233))); }

float rnd() { g_seed += 1; return hash(g_uv + g_seed); }

Ray makeRay(vec2 uv) {
    Ray r = Ray(vec3(0, 0, -3), normalize(vec3(uv, 1)));
    return r;
}

void stepIt(inout vec3 p, out float d) {
    p *= 2;
    d = length(p) - 1;
}

float sharp(float x) {
    if (x == 0) return 0;
    return x > 0.5 ? 1 : x < 0.1 ? 0 : x;
}

vec3 bg() {
    float v = S(0, 1, g_uv.y);
    if (v < 0.01) discard;
    return mix(PAL[0], PAL[2], v);
}

void mainImage( out vec4 O, vec2 U )
{
    g_uv = U / iResolution.xy;
    Ray r = makeRay(g_uv * 2 - 1);
    vec3 col = vec3(0);
    for (int i = 0; i < N; ++i) {
        float fi = float(i) / float(N);
        col += PAL[i % 3] * rnd() * fi / N;
    }
    vec3 p = r.d;
    float d;
    stepIt(p, d);
    col += sharp(d) * 0.1;
    col += bg() * 0.2;
    vec2 q = vec2(1, 2) * 3;
    q /= 2;
    float a = -1;
    a *= 2;
    int k = 0;
    while (k < 3) { k++; }
    col += textureLod(iChannel1, g_uv, 0).rgb * 0.;
    col *= ID * vec3(1);
    col += sin(iDate.w) * iTimeDelta * 0.;
    O = vec4(col, 1) + q.xyxy * 0. + a * 0.;
}
