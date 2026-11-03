# Compile chaque .gdshader d'un dossier avec le compilateur de Godot et
# échoue si un seul a une erreur. Usage :
#   godot --headless --path tools -s validate.gd -- <dossier>
extends SceneTree

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var dir: String = args[0] if args.size() > 0 else "res://../tests/out"
	var files := DirAccess.get_files_at(dir)
	var count := 0
	for f in files:
		if not f.ends_with(".gdshader"):
			continue
		count += 1
		printerr("SHADER_BEGIN ", f)
		var sh := Shader.new()
		sh.code = FileAccess.get_file_as_string(dir.path_join(f))
		# La compilation est paresseuse : demander la liste des uniforms la force.
		var mat := ShaderMaterial.new()
		mat.shader = sh
		sh.get_shader_uniform_list()
		RenderingServer.force_sync()
		printerr("SHADER_END ", f)
	printerr("SHADER_COUNT ", count)
	quit()
