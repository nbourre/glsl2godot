#version 330 core
out vec4 FragColor;

in vec2 TexCoord;
in vec3 FragPos;

uniform sampler2D texture1;
uniform vec3 lightColor = vec3(1.0, 0.9, 0.8);
uniform float mixValue = 0.8;
uniform float time;

void main()
{
    vec2 uv = TexCoord + vec2(sin(time + TexCoord.y * 8.0) * 0.02, 0.0);
    float vignette = 1.0 - length(TexCoord - 0.5) * 0.8;
    FragColor = texture(texture1, uv) * vec4(lightColor, 1.0) * vignette * mixValue;
}
