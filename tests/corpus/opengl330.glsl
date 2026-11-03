#version 330 core
out vec4 FragColor;

in vec2 TexCoord;
in vec3 FragPos;

uniform sampler2D texture1;
uniform vec3 lightColor;
uniform float mixValue = 0.5;

void main()
{
    float d = length(FragPos) / 10;
    FragColor = texture(texture1, TexCoord) * vec4(lightColor, 1) * (1 - d) * mixValue;
}
