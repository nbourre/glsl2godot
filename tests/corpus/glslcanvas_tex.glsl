#ifdef GL_ES
precision mediump float;
#endif
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
varying vec2 v_texcoord;

void main(void) {
    vec2 st = v_texcoord;
    vec4 c = texture2D(u_tex0, st + vec2(sin(u_time + st.y * 10.) * .01, 0));
    gl_FragColor = c;
}
