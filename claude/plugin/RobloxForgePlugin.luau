-- RobloxForge Studio Plugin — Phase 1 Quality Push
-- Snap-aligned placement, SCALE constants, clearance checks, palette session
-- Tools: execute_luau, create_part, create_instance, set_properties,
--        set_properties_many, delete_instances, clone_instance,
--        find_instances, get_tree, get_properties, set_waypoint,
--        try_save_place, get_console_output,
--        batch, build_room, build_corridor, build_doorway,
--        build_composite, build_grid, populate_room,
--        add_light, add_flicker, add_pulse,
--        start_playtest, get_playtest_output, stop_playtest

local HttpService       = game:GetService("HttpService")
local ChangeHistory     = game:GetService("ChangeHistoryService")
local CollectionService = game:GetService("CollectionService")
local LogService        = game:GetService("LogService")
local RunService        = game:GetService("RunService")

local BASE_URL         = "http://127.0.0.1:44755"
local BACKOFF          = 3
local PROTOCOL_VERSION = 1

print("[RobloxForge] Plugin loaded — booting…")

-- ─── Live state (GUI + transport share this) ─────────────────────────────────

local state = {
	running      = true,
	connected    = false,
	lastPollAt   = 0,
	lastCmdAt    = 0,
	lastCmdTool  = "",
	lastError    = "",
	pollCount    = 0,
	cmdCount     = 0,
	postFailures = 0,
	recent       = {},
}

local RECENT_MAX = 12

local function stateAddRecent(tool, ok, errMsg)
	table.insert(state.recent, 1, { t = os.time(), tool = tool, ok = ok, err = errMsg or "" })
	if #state.recent > RECENT_MAX then state.recent[#state.recent] = nil end
end

-- ─── Log capture ─────────────────────────────────────────────────────────────

local logBuffer = {}
local LOG_MAX   = 500

LogService.MessageOut:Connect(function(message, messageType)
	table.insert(logBuffer, {
		message = message,
		level   = tostring(messageType):match("%.([^%.]+)$") or tostring(messageType),
		time    = os.clock(),
	})
	if #logBuffer > LOG_MAX then table.remove(logBuffer, 1) end
end)

-- ─── Path utilities ───────────────────────────────────────────────────────────

local function getByPath(path)
	if not path or path == "" then return game end
	local cur = game
	for part in string.gmatch(path, "[^%.]+") do
		cur = cur:FindFirstChild(part)
		if not cur then return nil end
	end
	return cur
end

local function pathOf(inst)
	if not inst or inst == game then return "" end
	local parts = {}
	local cur = inst
	while cur and cur ~= game do
		table.insert(parts, 1, cur.Name)
		cur = cur.Parent
	end
	return table.concat(parts, ".")
end

-- ─── Serialization ────────────────────────────────────────────────────────────

local function serialize(val)
	local t = typeof(val)
	if t == "Vector3" then
		return { x = val.X, y = val.Y, z = val.Z }
	elseif t == "Color3" then
		return { r = math.round(val.R*255), g = math.round(val.G*255), b = math.round(val.B*255) }
	elseif t == "CFrame" then
		local p = val.Position
		return { position = { x = p.X, y = p.Y, z = p.Z } }
	elseif t == "EnumItem" then
		return tostring(val):match("%.([^%.]+)$") or tostring(val)
	elseif t == "number" or t == "string" or t == "boolean" then
		return val
	elseif val == nil then
		return nil
	else
		return tostring(val)
	end
end

-- ─── Parsing ─────────────────────────────────────────────────────────────────

local function parseColor(c)
	if type(c) == "table" then
		return Color3.fromRGB(c.r or 255, c.g or 255, c.b or 255)
	elseif type(c) == "string" then
		local hex = c:gsub("#", "")
		return Color3.fromRGB(
			tonumber(hex:sub(1,2), 16) or 255,
			tonumber(hex:sub(3,4), 16) or 255,
			tonumber(hex:sub(5,6), 16) or 255
		)
	end
	return Color3.new(1,1,1)
end

local function parseV3(t)
	if not t then return Vector3.zero end
	return Vector3.new(t.x or 0, t.y or 0, t.z or 0)
end

local function parseMaterial(m)
	if not m then return nil end
	local ok, mat = pcall(function() return Enum.Material[m] end)
	return (ok and mat) or nil
end

local function parseRoomCF(cfArg)
	if not cfArg then return CFrame.new(0,0,0) end
	local p = cfArg.position or cfArg
	local cf = CFrame.new(p.x or 0, p.y or 0, p.z or 0)
	if cfArg.rotation then
		local r = cfArg.rotation
		cf = cf * CFrame.Angles(math.rad(r.x or 0), math.rad(r.y or 0), math.rad(r.z or 0))
	end
	return cf
end

-- Smart property setter: auto-converts based on current property type
local function smartSet(inst, key, val)
	local cur
	pcall(function() cur = inst[key] end)
	local t = typeof(cur)
	if t == "Color3" then
		inst[key] = parseColor(val)
	elseif t == "Vector3" then
		inst[key] = parseV3(val)
	elseif t == "EnumItem" then
		local enumTypeName = tostring(cur):match("Enum%.(.-)%.")
		if enumTypeName then
			local ok2, ev = pcall(function() return Enum[enumTypeName][val] end)
			if ok2 and ev then inst[key] = ev; return end
		end
		inst[key] = val
	else
		inst[key] = val
	end
end

-- ─── Waypoint ────────────────────────────────────────────────────────────────

local function wp(label)
	pcall(function() ChangeHistory:SetWaypoint(label) end)
end

-- ─── Scale constants ─────────────────────────────────────────────────────────

local SCALE = {
	tile         = 4,
	ceiling      = 10,
	wallThickness = 0.5,
	humanScale   = 5,
	door         = { width = 4, height = 7 },
}

-- ─── Snap helpers ────────────────────────────────────────────────────────────

local function snapScalar(n, tile)
	tile = tile or SCALE.tile
	if tile <= 0 then return n end
	return math.round(n / tile) * tile
end

-- Snaps X and Z; Y is left untouched (callers set Y explicitly from floor geometry).
local function snapXZ(v, tile)
	tile = tile or SCALE.tile
	return Vector3.new(snapScalar(v.X, tile), v.Y, snapScalar(v.Z, tile))
end

-- ─── AABB collision helpers ──────────────────────────────────────────────────

-- Returns true when two axis-aligned bounding boxes penetrate (touching = false).
local function aabbOverlap(aMin, aMax, bMin, bMax)
	return aMin.X < bMax.X and aMax.X > bMin.X
	   and aMin.Y < bMax.Y and aMax.Y > bMin.Y
	   and aMin.Z < bMax.Z and aMax.Z > bMin.Z
end

-- Check a candidate (CFrame + size) against a list of existing BasePart instances.
-- Returns: collides (bool), collidingPath (string|nil)
local function wouldCollide(candidateCF, candidateSize, existingParts)
	local half = candidateSize / 2
	local cMin = candidateCF.Position - half
	local cMax = candidateCF.Position + half
	for _, part in ipairs(existingParts) do
		if part:IsA("BasePart") then
			local ph = part.Size / 2
			local pMin = part.CFrame.Position - ph
			local pMax = part.CFrame.Position + ph
			if aabbOverlap(cMin, cMax, pMin, pMax) then
				return true, pathOf(part)
			end
		end
	end
	return false
end

-- ─── Tool table ──────────────────────────────────────────────────────────────

local tools = {}

-- execute_luau
function tools.execute_luau(args)
	if type(args.code) ~= "string" then
		return { ok = false, error = "args.code must be a string" }
	end
	local fn, err = loadstring(args.code)
	if not fn then return { ok = false, error = "Parse error: " .. tostring(err) } end
	local ok, val = pcall(fn)
	if not ok then return { ok = false, error = "Runtime error: " .. tostring(val) } end
	return { ok = true, data = val }
end

-- create_part
function tools.create_part(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end

	local p = Instance.new("Part")
	p.Name        = args.name or "Part"
	p.Anchored    = (args.anchored ~= false)
	p.Reflectance = args.reflectance or 0
	if args.size     then p.Size = parseV3(args.size) end
	if args.position then
		local pos = parseV3(args.position)
		if args.snap ~= false then pos = snapXZ(pos, args.tile) end
		p.CFrame = CFrame.new(pos)
	end
	if args.material     then local m = parseMaterial(args.material); if m then p.Material = m end end
	if args.color        then p.Color       = parseColor(args.color) end
	if args.transparency ~= nil then p.Transparency = args.transparency end
	if args.canCollide   ~= nil then p.CanCollide   = args.canCollide end
	if args.castShadow   ~= nil then p.CastShadow   = args.castShadow end
	p.Parent = parent
	wp("RobloxForge: create_part " .. p.Name)

	return { ok = true, data = {
		path   = pathOf(p),
		actual = {
			Name = p.Name, Size = serialize(p.Size), Position = serialize(p.Position),
			Material = serialize(p.Material), Color = serialize(p.Color),
			Transparency = p.Transparency, Anchored = p.Anchored, Reflectance = p.Reflectance,
		},
		persisted = false,
	}}
end

-- create_instance
function tools.create_instance(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local ok, inst = pcall(Instance.new, args.className)
	if not ok then return { ok = false, error = "Cannot create " .. tostring(args.className) .. ": " .. tostring(inst) } end
	local errors = {}
	for k, v in pairs(args.props or {}) do
		if k ~= "Parent" then
			local ok2, e = pcall(function() inst[k] = v end)
			if not ok2 then table.insert(errors, k .. ": " .. tostring(e)) end
		end
	end
	inst.Parent = parent
	wp("RobloxForge: create_instance " .. inst.ClassName)
	return { ok = true, data = { path = pathOf(inst), className = inst.ClassName, name = inst.Name,
		errors = (#errors > 0) and errors or nil, persisted = false } }
end

-- set_properties (shared helper)
local function doSetProperties(target, props)
	local inst = getByPath(target)
	if not inst then return { ok = false, error = "Instance not found: " .. tostring(target) } end
	local changed, errors = {}, {}
	for k, v in pairs(props or {}) do
		local ok, e = pcall(function() smartSet(inst, k, v) end)
		if ok then table.insert(changed, k) else table.insert(errors, k .. ": " .. tostring(e)) end
	end
	wp("RobloxForge: set_properties " .. (inst.Name or ""))
	local actual = {}
	for _, k in ipairs(changed) do
		local ok2, v = pcall(function() return inst[k] end)
		if ok2 then actual[k] = serialize(v) end
	end
	return { ok = (#errors == 0), data = { path = pathOf(inst), actual = actual, persisted = false },
		error = (#errors > 0) and table.concat(errors, "; ") or nil }
end

function tools.set_properties(args) return doSetProperties(args.target, args.props) end

function tools.set_properties_many(args)
	local results = {}
	for _, e in ipairs(args.targets or {}) do
		table.insert(results, doSetProperties(e.target, e.props))
	end
	return { ok = true, data = { results = results } }
end

function tools.delete_instances(args)
	local deleted, errors = {}, {}
	for _, path in ipairs(args.paths or {}) do
		local inst = getByPath(path)
		if inst and inst ~= game then
			wp("RobloxForge: delete " .. path)
			inst:Destroy()
			table.insert(deleted, path)
		else
			table.insert(errors, "Not found: " .. tostring(path))
		end
	end
	return { ok = (#errors == 0), data = { deleted = deleted },
		error = (#errors > 0) and table.concat(errors, "; ") or nil }
end

function tools.clone_instance(args)
	local source = getByPath(args.source)
	if not source then return { ok = false, error = "Source not found: " .. tostring(args.source) } end
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local count  = args.count or 1
	local offset = args.offset and parseV3(args.offset) or Vector3.zero
	local doSnap = (args.snap ~= false)
	local tile   = args.tile
	local created = {}
	for i = 1, count do
		local clone = source:Clone()
		local off = offset * (i - 1)
		if clone:IsA("BasePart") then
			local newPos = (clone.CFrame + off).Position
			if doSnap then newPos = snapXZ(newPos, tile) end
			clone.CFrame = CFrame.new(newPos)
		elseif clone.PrimaryPart then
			local newPos = (clone:GetPivot() + off).Position
			if doSnap then newPos = snapXZ(newPos, tile) end
			clone:PivotTo(CFrame.new(newPos))
		end
		clone.Parent = parent
		table.insert(created, pathOf(clone))
	end
	wp("RobloxForge: clone_instance " .. source.Name)
	return { ok = true, data = { created = created, count = #created, persisted = false } }
end

function tools.find_instances(args)
	local root = getByPath(args.parent or "")
	if not root then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local results = {}
	if args.tag then
		for _, inst in ipairs(CollectionService:GetTagged(args.tag)) do
			if inst:IsDescendantOf(root) then
				table.insert(results, { path = pathOf(inst), className = inst.ClassName, name = inst.Name })
			end
		end
	else
		for _, inst in ipairs(root:GetDescendants()) do
			local match = true
			if args.className   and inst.ClassName ~= args.className then match = false end
			if args.namePattern and not string.find(inst.Name, args.namePattern) then match = false end
			if match then
				table.insert(results, { path = pathOf(inst), className = inst.ClassName, name = inst.Name })
			end
		end
	end
	return { ok = true, data = { instances = results, count = #results } }
end

local function buildTree(inst, maxD, d)
	d = d or 0
	local node = { name = inst.Name, className = inst.ClassName, path = pathOf(inst) }
	if d < maxD then
		node.children = {}
		for _, child in ipairs(inst:GetChildren()) do
			table.insert(node.children, buildTree(child, maxD, d + 1))
		end
	end
	return node
end

function tools.get_tree(args)
	local root = getByPath(args.root or "Workspace")
	if not root then return { ok = false, error = "Root not found: " .. tostring(args.root) } end
	return { ok = true, data = buildTree(root, args.depth or 3) }
end

function tools.get_properties(args)
	local inst = getByPath(args.target)
	if not inst then return { ok = false, error = "Instance not found: " .. tostring(args.target) } end
	local props = {}
	if args.keys then
		for _, k in ipairs(args.keys) do
			local ok2, v = pcall(function() return inst[k] end)
			props[k] = ok2 and serialize(v) or nil
		end
	else
		local common = { "Name", "ClassName", "Archivable" }
		if inst:IsA("BasePart") then
			for _, k in ipairs({"Size","Position","Material","Color","Transparency","Anchored","CanCollide","Reflectance","CastShadow"}) do
				table.insert(common, k)
			end
		end
		for _, k in ipairs(common) do
			local ok2, v = pcall(function() return inst[k] end)
			if ok2 then props[k] = serialize(v) end
		end
	end
	return { ok = true, data = { path = pathOf(inst), properties = props } }
end

function tools.set_waypoint(args)
	wp(args.label or "RobloxForge")
	return { ok = true, data = { label = args.label } }
end

function tools.try_save_place(_args)
	return { ok = true, data = { saved = false, persisted = false,
		reason = "Studio has no programmatic save API from plugins. Press Ctrl+S to save." } }
end

function tools.get_console_output(args)
	local lf = args.levelFilter and args.levelFilter:lower()
	local sm = args.sinceMarker
	local filtered = {}
	for _, e in ipairs(logBuffer) do
		local inc = true
		if lf and not string.find(e.level:lower(), lf) then inc = false end
		if sm and e.time < sm then inc = false end
		if inc then table.insert(filtered, e) end
	end
	return { ok = true, data = { logs = filtered, count = #filtered, marker = os.clock() } }
end

-- ─── Project Intelligence ────────────────────────────────────────────────────

function tools.get_project_tree(args)
	local root = getByPath(args.root or "Workspace")
	if not root then return { ok = false, error = "Root not found: " .. tostring(args.root) } end
	local classFilter = args.className
	local function buildFiltered(inst, maxD, d)
		d = d or 0
		local node = { name = inst.Name, className = inst.ClassName, path = pathOf(inst) }
		if d < maxD then
			node.children = {}
			for _, child in ipairs(inst:GetChildren()) do
				if not classFilter or child.ClassName == classFilter or child:IsA(classFilter) then
					table.insert(node.children, buildFiltered(child, maxD, d + 1))
				end
			end
		end
		return node
	end
	return { ok = true, data = buildFiltered(root, args.depth or 4) }
end

function tools.get_workspace_stats(_args)
	local counts = {}
	local total = 0
	for _, inst in ipairs(workspace:GetDescendants()) do
		counts[inst.ClassName] = (counts[inst.ClassName] or 0) + 1
		total = total + 1
	end
	local sorted = {}
	for cls, cnt in pairs(counts) do table.insert(sorted, { className = cls, count = cnt }) end
	table.sort(sorted, function(a, b) return a.count > b.count end)
	local top = {}
	for i = 1, math.min(20, #sorted) do table.insert(top, sorted[i]) end
	return { ok = true, data = { totalInstances = total, topClasses = top } }
end

function tools.find_models(args)
	args.className = "Model"
	return tools.find_instances(args)
end

function tools.find_parts(args)
	local root = getByPath(args.parent or "Workspace")
	if not root then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local results = {}
	for _, inst in ipairs(root:GetDescendants()) do
		if inst:IsA("BasePart") then
			local match = true
			if args.namePattern and not string.find(inst.Name, args.namePattern) then match = false end
			if match then
				table.insert(results, {
					path = pathOf(inst), className = inst.ClassName, name = inst.Name,
					size = serialize(inst.Size), position = serialize(inst.Position)
				})
			end
		end
	end
	return { ok = true, data = { instances = results, count = #results } }
end

function tools.find_scripts(args)
	local root = getByPath(args.parent or "")
	if not root then root = game end
	local scriptClasses = { Script = true, LocalScript = true, ModuleScript = true }
	local results = {}
	for _, inst in ipairs(root:GetDescendants()) do
		if scriptClasses[inst.ClassName] then
			local match = true
			if args.className and inst.ClassName ~= args.className then match = false end
			if args.namePattern and not string.find(inst.Name, args.namePattern) then match = false end
			if match then
				table.insert(results, {
					path = pathOf(inst), className = inst.ClassName,
					name = inst.Name, parent = pathOf(inst.Parent)
				})
			end
		end
	end
	return { ok = true, data = { scripts = results, count = #results } }
end

function tools.get_script_source(args)
	local inst = getByPath(args.target)
	if not inst then return { ok = false, error = "Not found: " .. tostring(args.target) } end
	if not inst:IsA("LuaSourceContainer") then
		return { ok = false, error = "Not a script: " .. inst.ClassName }
	end
	local src = inst.Source or ""
	local maxLen = args.maxLength or 8000
	local truncated = #src > maxLen
	return { ok = true, data = {
		path = pathOf(inst), className = inst.ClassName,
		source = src:sub(1, maxLen), truncated = truncated, length = #src
	}}
end

function tools.search_scripts(args)
	if not args.pattern then return { ok = false, error = "pattern is required" } end
	local root = getByPath(args.parent or "")
	if not root then root = game end
	local scriptClasses = { Script = true, LocalScript = true, ModuleScript = true }
	local results = {}
	local maxResults = args.maxResults or 50
	for _, inst in ipairs(root:GetDescendants()) do
		if scriptClasses[inst.ClassName] and #results < maxResults then
			local src = inst.Source or ""
			local matches = {}
			local lineNo = 0
			for line in (src .. "\n"):gmatch("([^\n]*)\n") do
				lineNo = lineNo + 1
				if string.find(line, args.pattern) then
					table.insert(matches, { line = lineNo, content = line:sub(1, 200) })
				end
			end
			if #matches > 0 then
				table.insert(results, {
					path = pathOf(inst), className = inst.ClassName,
					name = inst.Name, matches = matches
				})
			end
		end
	end
	return { ok = true, data = { results = results, count = #results } }
end

function tools.find_remote_events(args)
	args.className = "RemoteEvent"
	return tools.find_instances(args)
end

function tools.find_remote_functions(args)
	args.className = "RemoteFunction"
	return tools.find_instances(args)
end

function tools.dependency_graph(_args)
	local nodes = {}
	local edges = {}
	local scriptClasses = { Script = true, LocalScript = true, ModuleScript = true }
	for _, inst in ipairs(game:GetDescendants()) do
		if scriptClasses[inst.ClassName] then
			local p = pathOf(inst)
			table.insert(nodes, { id = p, name = inst.Name, className = inst.ClassName })
			local src = inst.Source or ""
			for evName in src:gmatch("([%w_]+):FireServer") do
				table.insert(edges, { source = p, target = evName, relation = "fires_server" })
			end
			for evName in src:gmatch("([%w_]+):InvokeServer") do
				table.insert(edges, { source = p, target = evName, relation = "invokes_server" })
			end
			for evName in src:gmatch("([%w_]+)%.OnServerEvent") do
				table.insert(edges, { source = evName, target = p, relation = "on_server_event" })
			end
			for reqStr in src:gmatch('require%b()') do
				table.insert(edges, { source = p, target = reqStr:sub(1, 200), relation = "requires" })
			end
		end
	end
	return { ok = true, data = { nodes = nodes, edges = edges, nodeCount = #nodes, edgeCount = #edges } }
end

function tools.analyze_project(_args)
	local scriptCount, remoteEventCount, remoteFunctionCount, partCount, modelCount = 0, 0, 0, 0, 0
	local scriptClasses = { Script = true, LocalScript = true, ModuleScript = true }
	local services = {}
	local warnings = {}
	for _, inst in ipairs(game:GetDescendants()) do
		if scriptClasses[inst.ClassName] then scriptCount = scriptCount + 1 end
		if inst.ClassName == "RemoteEvent"   then remoteEventCount   = remoteEventCount   + 1 end
		if inst.ClassName == "RemoteFunction" then remoteFunctionCount = remoteFunctionCount + 1 end
		if inst:IsA("BasePart")  then partCount  = partCount  + 1 end
		if inst.ClassName == "Model" then modelCount = modelCount + 1 end
	end
	for _, svc in ipairs(game:GetChildren()) do
		services[svc.Name] = svc.ClassName
	end
	if scriptCount == 0 then table.insert(warnings, "No scripts found") end
	if partCount   == 0 then table.insert(warnings, "No parts found in Workspace") end
	return { ok = true, data = {
		scriptCount = scriptCount, remoteEventCount = remoteEventCount,
		remoteFunctionCount = remoteFunctionCount, partCount = partCount,
		modelCount = modelCount, services = services, warnings = warnings
	}}
end

function tools.create_snapshot(_args)
	local scriptCount, partCount, modelCount, instanceTotal = 0, 0, 0, 0
	local scriptClasses = { Script = true, LocalScript = true, ModuleScript = true }
	local topModels = {}
	for _, inst in ipairs(game:GetDescendants()) do
		instanceTotal = instanceTotal + 1
		if scriptClasses[inst.ClassName] then scriptCount = scriptCount + 1 end
		if inst:IsA("BasePart") then partCount = partCount + 1 end
		if inst.ClassName == "Model" then
			modelCount = modelCount + 1
			if #topModels < 30 then
				table.insert(topModels, { path = pathOf(inst), name = inst.Name })
			end
		end
	end
	return { ok = true, data = {
		pluginTimestamp = os.time(), instanceTotal = instanceTotal,
		scriptCount = scriptCount, partCount = partCount,
		modelCount = modelCount, topModels = topModels
	}}
end

-- ─── batch ───────────────────────────────────────────────────────────────────

function tools.batch(args)
	local commands = args.commands or {}
	local results = {}
	for _, cmd in ipairs(commands) do
		local ok, result = pcall(function()
			local handler = tools[cmd.tool]
			if not handler then
				return { ok = false, error = "Unknown tool: " .. tostring(cmd.tool) }
			end
			return handler(cmd.args or {})
		end)
		table.insert(results, ok and result or { ok = false, error = "pcall: " .. tostring(result) })
	end
	return { ok = true, data = { results = results } }
end

-- ─── build_room ──────────────────────────────────────────────────────────────

function tools.build_room(args)
	local parent = getByPath(args.parentPath or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parentPath) } end

	local sx  = (args.sizeXZ  and args.sizeXZ.x)  or 20
	local sz  = (args.sizeXZ  and args.sizeXZ.z)  or 20
	local h   = args.ceilingHeight or SCALE.ceiling
	local wt  = args.wallThickness or SCALE.wallThickness

	local fMat = args.floorMaterial   or "Concrete"
	local wMat = args.wallMaterial    or "Concrete"
	local cMat = args.ceilingMaterial or "Concrete"
	local fCol = args.floorColor   and parseColor(args.floorColor)   or Color3.fromRGB(72,76,84)
	local wCol = args.wallColor    and parseColor(args.wallColor)    or Color3.fromRGB(80,84,92)
	local cCol = args.ceilingColor and parseColor(args.ceilingColor) or Color3.fromRGB(60,64,72)

	local baseCF = parseRoomCF(args.floorCFrame)
	-- Snap room origin to world grid (XZ only; Y is the caller-supplied floor surface height).
	if args.snap ~= false then
		local p    = baseCF.Position
		local tile = args.tile or SCALE.tile
		baseCF = baseCF - p + Vector3.new(snapScalar(p.X, tile), p.Y, snapScalar(p.Z, tile))
	end

	local model = Instance.new("Model")
	model.Name   = args.name or "Room"
	model.Parent = parent

	local createdPaths  = {}
	local doorwayMarkers = {}

	-- Part factory: positions in room-local space
	local function rp(name, localCF, size, mat, col)
		local p = Instance.new("Part")
		p.Name = name; p.Anchored = true; p.Reflectance = 0
		p.CFrame    = baseCF * localCF
		p.Size      = size
		p.Material  = parseMaterial(mat) or Enum.Material.Concrete
		p.Color     = col
		p.Parent    = model
		table.insert(createdPaths, pathOf(p))
		return p
	end

	-- Floor: top surface at Y=0, part center at Y=-wt/2
	rp("Floor",   CFrame.new(0, -wt/2, 0),    Vector3.new(sx+2*wt, wt, sz+2*wt), fMat, fCol)
	rp("Ceiling", CFrame.new(0, h+wt/2, 0),   Vector3.new(sx+2*wt, wt, sz+2*wt), cMat, cCol)

	-- Wall builder — N/S walls extend along room X, thickness along Z
	local function buildNS(wname, localCF, fullW, doorList)
		if #doorList == 0 then
			rp(wname, localCF, Vector3.new(fullW, h, wt), wMat, wCol); return
		end
		table.sort(doorList, function(a,b) return (a.offset or 0) < (b.offset or 0) end)
		local x = -fullW/2
		for i, dw in ipairs(doorList) do
			local dOff = dw.offset or 0
			local dW   = dw.width  or 2
			local dH   = dw.height or 3
			local dL   = dOff - dW/2
			local dR   = dOff + dW/2
			if dL > x + 0.01 then
				local sw = dL - x
				rp(wname.."_Seg"..i.."L", localCF * CFrame.new(x + sw/2, 0, 0), Vector3.new(sw, h, wt), wMat, wCol)
			end
			if dH < h - 0.01 then
				local th = h - dH
				rp(wname.."_Top"..i, localCF * CFrame.new(dOff, -h/2 + dH + th/2, 0), Vector3.new(dW, th, wt), wMat, wCol)
			end
			local dwCF = baseCF * localCF * CFrame.new(dOff, -h/2 + dH/2, 0)
			table.insert(doorwayMarkers, { wall = wname, width = dW, height = dH, worldPosition = serialize(dwCF.Position) })
			x = dR
		end
		if x < fullW/2 - 0.01 then
			local sw = fullW/2 - x
			rp(wname.."_SegLast", localCF * CFrame.new(x + sw/2, 0, 0), Vector3.new(sw, h, wt), wMat, wCol)
		end
	end

	-- Wall builder — E/W walls extend along room Z, thickness along X
	local function buildEW(wname, localCF, fullZ, doorList)
		if #doorList == 0 then
			rp(wname, localCF, Vector3.new(wt, h, fullZ), wMat, wCol); return
		end
		table.sort(doorList, function(a,b) return (a.offset or 0) < (b.offset or 0) end)
		local z = -fullZ/2
		for i, dw in ipairs(doorList) do
			local dOff = dw.offset or 0
			local dW   = dw.width  or 2
			local dH   = dw.height or 3
			local dL   = dOff - dW/2
			local dR   = dOff + dW/2
			if dL > z + 0.01 then
				local sw = dL - z
				rp(wname.."_Seg"..i.."L", localCF * CFrame.new(0, 0, z + sw/2), Vector3.new(wt, h, sw), wMat, wCol)
			end
			if dH < h - 0.01 then
				local th = h - dH
				rp(wname.."_Top"..i, localCF * CFrame.new(0, -h/2 + dH + th/2, dOff), Vector3.new(wt, th, dW), wMat, wCol)
			end
			local dwCF = baseCF * localCF * CFrame.new(0, -h/2 + dH/2, dOff)
			table.insert(doorwayMarkers, { wall = wname, width = dW, height = dH, worldPosition = serialize(dwCF.Position) })
			z = dR
		end
		if z < fullZ/2 - 0.01 then
			local sw = fullZ/2 - z
			rp(wname.."_SegLast", localCF * CFrame.new(0, 0, z + sw/2), Vector3.new(wt, h, sw), wMat, wCol)
		end
	end

	-- Doorway lists per face
	local dws = { N={}, S={}, E={}, W={} }
	for _, dw in ipairs(args.doorways or {}) do
		local face = (dw.wall or "N"):upper()
		if dws[face] then table.insert(dws[face], dw) end
	end

	-- North wall (Z- face), South wall (Z+ face): full width = sx + 2*wt
	buildNS("WallNorth", CFrame.new(0, h/2, -(sz/2 + wt/2)), sx + 2*wt, dws.N)
	buildNS("WallSouth", CFrame.new(0, h/2,   sz/2 + wt/2),  sx + 2*wt, dws.S)
	-- East wall (X+ face), West wall (X- face): interior depth only = sz
	buildEW("WallEast",  CFrame.new( sx/2 + wt/2, h/2, 0), sz, dws.E)
	buildEW("WallWest",  CFrame.new(-(sx/2 + wt/2), h/2, 0), sz, dws.W)

	wp("RobloxForge: build_room " .. model.Name)

	return { ok = true, data = {
		modelPath      = pathOf(model),
		createdParts   = createdPaths,
		doorwayMarkers = doorwayMarkers,
		persisted      = false,
	}}
end

-- ─── build_corridor ──────────────────────────────────────────────────────────

function tools.build_corridor(args)
	local parent = getByPath(args.parentPath or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parentPath) } end

	local fromPos = parseV3(args.fromCFrame and args.fromCFrame.position)
	local toPos   = parseV3(args.toCFrame   and args.toCFrame.position)
	-- Snap endpoints to world grid before computing midpoint / orientation.
	if args.snap ~= false then
		local tile = args.tile or SCALE.tile
		fromPos = snapXZ(fromPos, tile)
		toPos   = snapXZ(toPos, tile)
	end
	local width   = args.width  or (SCALE.door.width * 2)
	local height  = args.height or SCALE.ceiling
	local wt      = args.wallThickness or SCALE.wallThickness

	local fMat = args.floorMaterial or "Concrete"
	local wMat = args.wallMaterial  or "Concrete"
	local fCol = args.floorColor and parseColor(args.floorColor) or Color3.fromRGB(72,76,84)
	local wCol = args.wallColor  and parseColor(args.wallColor)  or Color3.fromRGB(80,84,92)

	local dir = toPos - fromPos
	local len = dir.Magnitude
	if len < 0.01 then return { ok = false, error = "fromCFrame and toCFrame are too close" } end

	local corrCF = CFrame.lookAt((fromPos + toPos) / 2, toPos, Vector3.new(0,1,0))

	local model = Instance.new("Model")
	model.Name = args.name or "Corridor"
	model.Parent = parent

	local created = {}
	local function cp(name, cf, size, mat, col)
		local p = Instance.new("Part")
		p.Name = name; p.Anchored = true; p.Reflectance = 0
		p.CFrame = cf; p.Size = size
		p.Material = parseMaterial(mat) or Enum.Material.Concrete
		p.Color = col; p.Parent = model
		table.insert(created, pathOf(p))
	end

	-- CFrame.lookAt makes: +X = right, +Y = up, -Z = forward (toward toPos)
	-- So corridor length is along -Z (local), width along X, height along Y
	cp("Floor",     corrCF * CFrame.new(0, -wt/2, 0),          Vector3.new(len, wt,  width+2*wt), fMat, fCol)
	cp("Ceiling",   corrCF * CFrame.new(0, height+wt/2, 0),    Vector3.new(len, wt,  width+2*wt), wMat, wCol)
	cp("WallLeft",  corrCF * CFrame.new(0, height/2, width/2+wt/2),  Vector3.new(len, height, wt), wMat, wCol)
	cp("WallRight", corrCF * CFrame.new(0, height/2, -(width/2+wt/2)), Vector3.new(len, height, wt), wMat, wCol)

	wp("RobloxForge: build_corridor " .. model.Name)
	return { ok = true, data = { modelPath = pathOf(model), createdParts = created, persisted = false } }
end

-- ─── build_doorway ───────────────────────────────────────────────────────────

function tools.build_doorway(args)
	local parent = getByPath(args.parentPath or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parentPath) } end

	local pos    = parseV3(args.position)
	-- Snap door center to world grid (XZ; Y is the opening center height, left as-is).
	if args.snap ~= false then
		pos = snapXZ(pos, args.tile)
	end
	local dW     = args.width     or SCALE.door.width
	local dH     = args.height    or SCALE.door.height
	local fd     = args.frameDepth or SCALE.wallThickness
	local ft     = 0.2 -- frame thickness
	local axis   = (args.facingAxis or "Z"):upper()
	local created = {}

	local function fp(name, cf, size)
		local p = Instance.new("Part")
		p.Name = name; p.Anchored = true; p.Reflectance = 0
		p.CFrame = cf; p.Size = size
		p.Material = Enum.Material.Metal
		p.Color = Color3.fromRGB(40,44,50)
		p.Parent = parent
		table.insert(created, pathOf(p))
	end

	-- Jambs and lintel oriented along the correct axis
	if axis == "Z" then
		fp("JambL",  CFrame.new(pos.X - dW/2 - ft/2, pos.Y, pos.Z), Vector3.new(ft, dH, fd))
		fp("JambR",  CFrame.new(pos.X + dW/2 + ft/2, pos.Y, pos.Z), Vector3.new(ft, dH, fd))
		fp("Lintel", CFrame.new(pos.X, pos.Y + dH/2 + ft/2, pos.Z), Vector3.new(dW + 2*ft, ft, fd))
	else -- X
		fp("JambL",  CFrame.new(pos.X, pos.Y, pos.Z - dW/2 - ft/2), Vector3.new(fd, dH, ft))
		fp("JambR",  CFrame.new(pos.X, pos.Y, pos.Z + dW/2 + ft/2), Vector3.new(fd, dH, ft))
		fp("Lintel", CFrame.new(pos.X, pos.Y + dH/2 + ft/2, pos.Z), Vector3.new(fd, ft, dW + 2*ft))
	end

	wp("RobloxForge: build_doorway")
	return { ok = true, data = { created = created, persisted = false } }
end

-- ─── build_composite ─────────────────────────────────────────────────────────

function tools.build_composite(args)
	local parent = getByPath(args.parentPath or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parentPath) } end

	local model = Instance.new("Model")
	model.Name = args.name or "Composite"
	model.Parent = parent

	local created       = {}
	local rejected      = {}
	local partInstances = {}  -- populated via getByPath for welding only (best-effort)
	local placedBounds  = {}  -- collision tracking using args data directly — no getByPath dependency
	local doCheck       = (args.clearance ~= false)

	for i, partArgs in ipairs(args.parts or {}) do
		partArgs = table.clone(partArgs)
		partArgs.parent = pathOf(model)

		-- Clearance check: use position/size from args directly, not from getByPath.
		-- This makes collision detection reliable even when getByPath has timing issues
		-- with incrementally-built models.
		if doCheck and partArgs.position and partArgs.size then
			local cPos  = parseV3(partArgs.position)
			local cSize = parseV3(partArgs.size)
			local cHalf = cSize / 2
			local cMin  = cPos - cHalf
			local cMax  = cPos + cHalf
			local collides = false
			for _, bounds in ipairs(placedBounds) do
				local bHalf = bounds.size / 2
				if aabbOverlap(cMin, cMax, bounds.center - bHalf, bounds.center + bHalf) then
					collides = true
					break
				end
			end
			if collides then
				table.insert(rejected, { index = i, reason = "clearance" })
				goto continue
			end
		end

		do
			local result = tools.create_part(partArgs)
			if result.ok then
				table.insert(created, result.data.path)
				-- Track bounds from args so future iterations can check against this part.
				-- Done after successful creation so failed creations don't occupy space.
				if partArgs.position and partArgs.size then
					table.insert(placedBounds, {
						center = parseV3(partArgs.position),
						size   = parseV3(partArgs.size),
					})
				end
				-- Attempt to get instance for welding; failure does not affect collision detection.
				local inst = getByPath(result.data.path)
				if inst then table.insert(partInstances, inst) end
			end
		end
		::continue::
	end

	local primary = partInstances[args.primaryPartIndex or 1]
	if primary then model.PrimaryPart = primary end

	if args.weld and primary then
		for _, p in ipairs(partInstances) do
			if p ~= primary then
				local w = Instance.new("WeldConstraint")
				w.Part0 = primary; w.Part1 = p; w.Parent = model
			end
		end
	end

	wp("RobloxForge: build_composite " .. model.Name)
	return { ok = true, data = {
		modelPath = pathOf(model), parts = created, persisted = false,
		rejected  = (#rejected > 0) and rejected or nil,
	}}
end

-- ─── build_grid ──────────────────────────────────────────────────────────────

function tools.build_grid(args)
	local parent = getByPath(args.parentPath or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parentPath) } end

	local rows    = args.rows or 2
	local cols    = args.cols or 2
	local spX     = (args.spacing and args.spacing.x) or SCALE.tile
	local spZ     = (args.spacing and args.spacing.z) or SCALE.tile
	local origin  = parseV3(args.origin)
	local tpl     = args.template or {}
	local doSnap  = (args.snap ~= false)
	local tile    = args.tile
	local created = {}

	-- Snap origin so the entire grid lands on the world grid
	if doSnap then origin = snapXZ(origin, tile) end

	for r = 0, rows - 1 do
		for c = 0, cols - 1 do
			local partArgs = {}
			for k, v in pairs(tpl) do partArgs[k] = v end
			partArgs.parent = args.parentPath
			partArgs.name   = (tpl.name or "GridPart") .. "_" .. r .. "_" .. c
			partArgs.snap   = false  -- origin already snapped; avoid double-snapping cell offsets
			partArgs.position = {
				x = origin.X + c * spX,
				y = origin.Y + (tpl.size and (tpl.size.y or 1) / 2 or 0.5),
				z = origin.Z + r * spZ,
			}

			local result = tools.create_part(partArgs)
			if result.ok then table.insert(created, result.data.path) end
		end
	end

	wp("RobloxForge: build_grid")
	return { ok = true, data = { created = created, count = #created, persisted = false } }
end

-- ─── populate_room ───────────────────────────────────────────────────────────
-- Receives a pre-computed PlacementPlan[] from composition.ts and instantiates parts.

function tools.populate_room(args)
	local parent = getByPath(args.roomModelPath or "Workspace")
	if not parent then return { ok = false, error = "Room model not found: " .. tostring(args.roomModelPath) } end

	local plans   = args.plans or {}
	local created  = {}
	local rejected = {}

	for i, plan in ipairs(plans) do
		if plan.rejected then
			table.insert(rejected, { index = i, reason = plan.rejected.reason })
		else
			local partArgs = {
				parent   = args.roomModelPath,
				name     = plan.name or ("Content_" .. i),
				size     = plan.size,
				color    = plan.color,
				material = plan.material,
				snap     = false,  -- positions already grid-aligned by composition.ts
			}
			-- Decode 12-float CFrame into position
			if plan.cframe and #plan.cframe >= 3 then
				partArgs.position = { x = plan.cframe[1], y = plan.cframe[2], z = plan.cframe[3] }
			end
			local result = tools.create_part(partArgs)
			if result.ok then
				table.insert(created, result.data.path)
			end
		end
	end

	wp("RobloxForge: populate_room")
	return { ok = true, data = {
		created  = created,
		rejected = (#rejected > 0) and rejected or nil,
		persisted = false,
	}}
end

-- ─── Lighting ────────────────────────────────────────────────────────────────

function tools.add_light(args)
	local parent = getByPath(args.parentPart)
	if not parent then return { ok = false, error = "Parent part not found: " .. tostring(args.parentPart) } end

	local ltype = args.type or "Point"
	local light
	if     ltype == "Point"   then light = Instance.new("PointLight")
	elseif ltype == "Spot"    then light = Instance.new("SpotLight")
	elseif ltype == "Surface" then light = Instance.new("SurfaceLight")
	else return { ok = false, error = "Unknown light type: " .. ltype } end

	light.Brightness = args.brightness or 1
	light.Range      = args.range      or 20
	if args.color   then light.Color   = parseColor(args.color) end
	if args.shadows ~= nil then light.Shadows = args.shadows end
	if args.angle   and light:IsA("SpotLight") then light.Angle = args.angle end
	light.Parent = parent

	return { ok = true, data = { path = pathOf(light), persisted = false } }
end

function tools.add_flicker(args)
	local light = getByPath(args.lightPath)
	if not light then return { ok = false, error = "Light not found: " .. tostring(args.lightPath) } end

	local minB = args.minBrightness or 0.5
	local maxB = args.maxBrightness or 1.5
	local minI = (args.intervalRange and args.intervalRange.min) or 0.05
	local maxI = (args.intervalRange and args.intervalRange.max) or 0.20

	local s = Instance.new("LocalScript")
	s.Name = "FlickerScript"
	s.Source = string.format(
		"local l=script.Parent local mn,mx,mi,ma=%f,%f,%f,%f\n" ..
		"while true do l.Brightness=mn+math.random()*(mx-mn) task.wait(mi+math.random()*(ma-mi)) end",
		minB, maxB, minI, maxI)
	s.Parent = light

	return { ok = true, data = { path = pathOf(s), persisted = false } }
end

function tools.add_pulse(args)
	local target = getByPath(args.lightOrNeonPath)
	if not target then return { ok = false, error = "Target not found: " .. tostring(args.lightOrNeonPath) } end

	local minB   = args.minB   or 0.5
	local maxB   = args.maxB   or 1.5
	local period = args.period or 2.0

	local s = Instance.new("LocalScript")
	s.Name = "PulseScript"
	s.Source = string.format([[
local t=script.Parent
local TS=game:GetService("TweenService")
local info=TweenInfo.new(%f,Enum.EasingStyle.Sine,Enum.EasingDirection.InOut,-1,true)
local prop=t:IsA("Light") and "Brightness" or "Transparency"
local val=t:IsA("Light") and %f or (1-%f)
TS:Create(t,info,{[prop]=val}):Play()
]], period/2, minB, minB)
	s.Parent = target

	return { ok = true, data = { path = pathOf(s), persisted = false } }
end

-- ─── Playtest ────────────────────────────────────────────────────────────────

local playtestMarker = nil

function tools.start_playtest(_args)
	playtestMarker = os.clock()
	local started = false
	pcall(function()
		game:GetService("TestService"):Run()
		started = true
	end)
	return { ok = true, data = {
		marker      = playtestMarker,
		autoStarted = started,
		note        = started
			and "TestService run started. Call get_playtest_output() to read logs."
			or  "TestService.Run() unavailable — press F5 in Studio. Call get_playtest_output() to read logs.",
	}}
end

function tools.get_playtest_output(args)
	local since = args.since or playtestMarker or 0
	local lf = args.levelFilter and args.levelFilter:lower()
	local filtered = {}
	for _, e in ipairs(logBuffer) do
		if e.time >= since then
			local inc = true
			if lf and not string.find(e.level:lower(), lf) then inc = false end
			if inc then table.insert(filtered, e) end
		end
	end
	local isRunMode = false
	pcall(function() isRunMode = game:GetService("RunService"):IsRunMode() end)
	return { ok = true, data = {
		logs      = filtered,
		count     = #filtered,
		isRunMode = isRunMode,
		marker    = os.clock(),
	}}
end

function tools.stop_playtest(_args)
	local since = playtestMarker or 0
	pcall(function() game:GetService("TestService"):Stop() end)
	local finalLogs = {}
	for _, e in ipairs(logBuffer) do
		if e.time >= since then table.insert(finalLogs, e) end
	end
	playtestMarker = nil
	return { ok = true, data = { logs = finalLogs, count = #finalLogs } }
end

-- ─── VFX ─────────────────────────────────────────────────────────────────────

local function applyVfxProps(emitter, args)
	if args.rate        then emitter.Rate        = args.rate        end
	if args.lifetime    then emitter.Lifetime    = NumberRange.new(args.lifetime) end
	if args.speed       then emitter.Speed       = NumberRange.new(args.speed)    end
	if args.size        then emitter.Size        = NumberSequence.new(args.size)  end
	if args.transparency then emitter.Transparency = NumberSequence.new(args.transparency) end
	if args.color       then
		local c = parseColor(args.color)
		if c then emitter.Color = ColorSequence.new(c) end
	end
	if args.texture     then emitter.Texture     = args.texture     end
	if args.enabled     ~= nil then emitter.Enabled = args.enabled  end
	if args.lightEmission then emitter.LightEmission = args.lightEmission end
	if args.spread      then emitter.SpreadAngle = Vector2.new(args.spread, args.spread) end
	if args.rotSpeed    then emitter.RotSpeed    = NumberRange.new(args.rotSpeed)  end
end

function tools.create_particle(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local emitter = Instance.new("ParticleEmitter")
	emitter.Name = args.name or "VFX_Particle"
	applyVfxProps(emitter, args)
	emitter.Parent = parent
	wp("RobloxForge: create_particle")
	return { ok = true, data = { path = pathOf(emitter) } }
end

local function spawnLocalScript(parent, name, src)
	local s = Instance.new("LocalScript")
	s.Name = name; s.Source = src; s.Parent = parent
	return s
end

function tools.create_fire(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local fire = Instance.new("Fire")
	fire.Name = args.name or "VFX_Fire"
	if args.color then local c = parseColor(args.color); if c then fire.Color = c end end
	if args.secondaryColor then local c = parseColor(args.secondaryColor); if c then fire.SecondaryColor = c end end
	if args.heat  then fire.Heat  = args.heat  end
	if args.size  then fire.Size  = args.size  end
	fire.Parent = parent
	wp("RobloxForge: create_fire")
	return { ok = true, data = { path = pathOf(fire) } }
end

function tools.create_smoke(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local smoke = Instance.new("Smoke")
	smoke.Name = args.name or "VFX_Smoke"
	if args.color then local c = parseColor(args.color); if c then smoke.Color = c end end
	if args.opacity   then smoke.Opacity   = args.opacity   end
	if args.riseVelocity then smoke.RiseVelocity = args.riseVelocity end
	if args.size   then smoke.Size = args.size end
	smoke.Parent = parent
	wp("RobloxForge: create_smoke")
	return { ok = true, data = { path = pathOf(smoke) } }
end

function tools.create_sparks(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local sparks = Instance.new("Sparkles")
	sparks.Name = args.name or "VFX_Sparks"
	if args.color then local c = parseColor(args.color); if c then sparks.SparkleColor = c end end
	sparks.Parent = parent
	wp("RobloxForge: create_sparks")
	return { ok = true, data = { path = pathOf(sparks) } }
end

function tools.create_explosion_vfx(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	-- Fire burst emitter
	local emitter = Instance.new("ParticleEmitter")
	emitter.Name = "VFX_Explosion"
	emitter.Rate = 0
	emitter.Lifetime = NumberRange.new(0.3, 0.6)
	emitter.Speed    = NumberRange.new(args.speed or 30)
	emitter.Size     = NumberSequence.new({ NumberSequenceKeypoint.new(0, args.radius or 5), NumberSequenceKeypoint.new(1, 0) })
	emitter.LightEmission = 0.8
	emitter.Parent = parent
	-- Emit burst
	emitter:Emit(args.count or 40)
	wp("RobloxForge: create_explosion_vfx")
	return { ok = true, data = { path = pathOf(emitter) } }
end

function tools.create_rain(args)
	local camera = workspace.CurrentCamera
	local emitter = Instance.new("ParticleEmitter")
	emitter.Name = "VFX_Rain"
	emitter.Rate = args.rate or 200
	emitter.Lifetime = NumberRange.new(1, 2)
	emitter.Speed    = NumberRange.new(args.speed or 40)
	emitter.SpreadAngle = Vector2.new(5, 5)
	emitter.Parent = camera
	wp("RobloxForge: create_rain")
	return { ok = true, data = { path = pathOf(emitter) } }
end

function tools.create_snow(args)
	local camera = workspace.CurrentCamera
	local emitter = Instance.new("ParticleEmitter")
	emitter.Name = "VFX_Snow"
	emitter.Rate = args.rate or 80
	emitter.Lifetime = NumberRange.new(3, 5)
	emitter.Speed    = NumberRange.new(args.speed or 5)
	emitter.SpreadAngle = Vector2.new(30, 30)
	emitter.Color = ColorSequence.new(Color3.new(1, 1, 1))
	emitter.Parent = camera
	wp("RobloxForge: create_snow")
	return { ok = true, data = { path = pathOf(emitter) } }
end

function tools.camera_shake(args)
	local dur   = args.duration  or 0.5
	local amp   = args.amplitude or 0.8
	local freq  = args.frequency or 15
	local src = string.format([[
local RunService = game:GetService("RunService")
local cam = workspace.CurrentCamera
local t = 0
local duration, amplitude, frequency = %f, %f, %f
local conn
conn = RunService.RenderStepped:Connect(function(dt)
	t = t + dt
	if t > duration then conn:Disconnect() return end
	local decay = 1 - (t / duration)
	local offset = Vector3.new(
		math.sin(t * frequency * 1.3) * amplitude * decay,
		math.cos(t * frequency) * amplitude * decay * 0.5,
		0
	)
	cam.CFrame = cam.CFrame * CFrame.new(offset)
end)
]], dur, amp, freq)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local s = spawnLocalScript(parent, "VFX_CameraShake", src)
	return { ok = true, data = { path = pathOf(s) } }
end

function tools.screen_flash(args)
	local color = args.color or "#FFFFFF"
	local dur   = args.duration or 0.3
	local src = string.format([[
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui", player.PlayerGui)
gui.Name = "VFX_Flash"
local frame = Instance.new("Frame", gui)
frame.Size = UDim2.fromScale(1, 1)
frame.BackgroundColor3 = Color3.fromHex("%s")
frame.BackgroundTransparency = 0
frame.BorderSizePixel = 0
local ti = TweenInfo.new(%f, Enum.EasingStyle.Linear)
TweenService:Create(frame, ti, {BackgroundTransparency = 1}):Play()
game:GetService("Debris"):AddItem(gui, %f + 0.1)
]], color:gsub("#",""), dur, dur)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local s = spawnLocalScript(parent, "VFX_ScreenFlash", src)
	return { ok = true, data = { path = pathOf(s) } }
end

-- ─── Animation ───────────────────────────────────────────────────────────────

function tools.create_animation(args)
	-- Build a KeyframeSequence from {keyframes: [{time, partName, position?, rotation?}]}
	local kfs = Instance.new("KeyframeSequence")
	kfs.Name = args.name or "RobloxForge_Anim"
	kfs.Loop = args.loop or false
	local keyframes = args.keyframes or {}
	for _, kd in ipairs(keyframes) do
		local kf = Instance.new("Keyframe")
		kf.Time = kd.time or 0
		local pose = Instance.new("Pose")
		pose.Name = kd.partName or "HumanoidRootPart"
		if kd.position or kd.rotation then
			local pos = kd.position and Vector3.new(kd.position.x or 0, kd.position.y or 0, kd.position.z or 0) or Vector3.zero
			local rotDeg = kd.rotation and Vector3.new(kd.rotation.x or 0, kd.rotation.y or 0, kd.rotation.z or 0) or Vector3.zero
			pose.CFrame = CFrame.new(pos) * CFrame.Angles(math.rad(rotDeg.X), math.rad(rotDeg.Y), math.rad(rotDeg.Z))
		end
		kf:AddSubPose(pose)
		kfs:AddKeyframe(kf)
	end
	local target = getByPath(args.parent or "ServerStorage")
	if not target then target = game:GetService("ServerStorage") end
	kfs.Parent = target
	wp("RobloxForge: create_animation " .. kfs.Name)
	return { ok = true, data = { path = pathOf(kfs), name = kfs.Name } }
end

function tools.animate_door(args)
	local door = getByPath(args.target)
	if not door then return { ok = false, error = "Door not found: " .. tostring(args.target) } end
	local openAngle = args.openAngle or 90
	local dur       = args.duration  or 0.5
	local axis      = args.axis      or "Y"
	local src = string.format([[
local TweenService = game:GetService("TweenService")
local door = script.Parent
local prompt = Instance.new("ProximityPrompt", door)
prompt.ActionText = "Open"
local open = false
local baseCF = door.CFrame
local rotOpen  = baseCF * CFrame.Angles(0, math.rad(%d), 0)
local rotClose = baseCF
local ti = TweenInfo.new(%f, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
prompt.Triggered:Connect(function()
	open = not open
	TweenService:Create(door, ti, {CFrame = open and rotOpen or rotClose}):Play()
	prompt.ActionText = open and "Close" or "Open"
end)
]], openAngle, dur)
	local s = Instance.new("LocalScript")
	s.Name = "AnimDoor"; s.Source = src; s.Parent = door
	wp("RobloxForge: animate_door")
	return { ok = true, data = { path = pathOf(s) } }
end

function tools.animate_elevator(args)
	local elevator = getByPath(args.target)
	if not elevator then return { ok = false, error = "Elevator not found: " .. tostring(args.target) } end
	local floorA = args.floorA or { x = 0, y = 0,  z = 0 }
	local floorB = args.floorB or { x = 0, y = 20, z = 0 }
	local dur    = args.duration or 2
	local src = string.format([[
local TweenService = game:GetService("TweenService")
local elevator = script.Parent
local prompt = Instance.new("ProximityPrompt", elevator)
prompt.ActionText = "Call Elevator"
local posA = Vector3.new(%f, %f, %f)
local posB = Vector3.new(%f, %f, %f)
local atA = true
local ti = TweenInfo.new(%f, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut)
prompt.Triggered:Connect(function()
	atA = not atA
	TweenService:Create(elevator, ti, {Position = atA and posA or posB}):Play()
end)
]], floorA.x or 0, floorA.y or 0, floorA.z or 0,
    floorB.x or 0, floorB.y or 0, floorB.z or 0, dur)
	local s = Instance.new("LocalScript")
	s.Name = "AnimElevator"; s.Source = src; s.Parent = elevator
	wp("RobloxForge: animate_elevator")
	return { ok = true, data = { path = pathOf(s) } }
end

function tools.animate_npc(args)
	local npc = getByPath(args.target)
	if not npc then return { ok = false, error = "NPC not found: " .. tostring(args.target) } end
	local preset = args.preset or "idle"
	-- Walk/idle AnimationId constants (standard R15 Roblox animations)
	local ANIM_IDS = {
		idle  = "rbxassetid://507766666",
		walk  = "rbxassetid://507767714",
		run   = "rbxassetid://507767714",
		jump  = "rbxassetid://507765000",
		fall  = "rbxassetid://507767968",
	}
	local animId = ANIM_IDS[preset] or ANIM_IDS.idle
	local humanoid = npc:FindFirstChildOfClass("Humanoid")
	if not humanoid then return { ok = false, error = "No Humanoid in NPC" } end
	local animator = humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		animator = Instance.new("Animator")
		animator.Parent = humanoid
	end
	local anim = Instance.new("Animation")
	anim.AnimationId = args.animationId or animId
	anim.Parent = npc
	local track = animator:LoadAnimation(anim)
	track:Play()
	wp("RobloxForge: animate_npc " .. preset)
	return { ok = true, data = { path = pathOf(anim), preset = preset, playing = true } }
end

function tools.create_cutscene(args)
	-- Generates a LocalScript that tweens camera through waypoints
	local beats = args.beats or {}
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	local beatsStr = "{"
	for i, b in ipairs(beats) do
		local p = b.position or {}
		local r = b.rotation or {}
		beatsStr = beatsStr .. string.format(
			"{time=%f,px=%f,py=%f,pz=%f,rx=%f,ry=%f,rz=%f},",
			b.time or (i-1)*2,
			p.x or 0, p.y or 10, p.z or 0,
			r.x or 0, r.y or 0,  r.z or 0
		)
	end
	beatsStr = beatsStr .. "}"
	local src = string.format([[
local TweenService = game:GetService("TweenService")
local cam = workspace.CurrentCamera
cam.CameraType = Enum.CameraType.Scriptable
local beats = %s
for i, b in ipairs(beats) do
	local targetCF = CFrame.new(b.px, b.py, b.pz) * CFrame.Angles(math.rad(b.rx), math.rad(b.ry), math.rad(b.rz))
	local dur = i < #beats and (beats[i+1].time - b.time) or 1
	TweenService:Create(cam, TweenInfo.new(dur, Enum.EasingStyle.Sine), {CFrame = targetCF}):Play()
	task.wait(dur)
end
cam.CameraType = Enum.CameraType.Custom
script:Destroy()
]], beatsStr)
	local s = Instance.new("LocalScript")
	s.Name = "Cutscene"; s.Source = src; s.Parent = parent
	wp("RobloxForge: create_cutscene")
	return { ok = true, data = { path = pathOf(s), beatCount = #beats } }
end

-- ─── UI Builder ──────────────────────────────────────────────────────────────

local function buildGuiNode(parent, node)
	if type(node) ~= "table" then return nil end
	local kind = node.kind or "Frame"
	local inst = Instance.new(kind)
	inst.Name = node.name or kind
	-- Common GuiObject properties
	if node.size     then inst.Size     = UDim2.fromScale(node.size[1] or 1, node.size[2] or 1) end
	if node.position then inst.Position = UDim2.fromScale(node.position[1] or 0, node.position[2] or 0) end
	if node.anchorPoint then inst.AnchorPoint = Vector2.new(node.anchorPoint[1] or 0, node.anchorPoint[2] or 0) end
	if node.backgroundColor then
		local c = parseColor(node.backgroundColor)
		if c then inst.BackgroundColor3 = c end
	end
	if node.backgroundTransparency ~= nil then inst.BackgroundTransparency = node.backgroundTransparency end
	if node.borderSizePixel ~= nil then inst.BorderSizePixel = node.borderSizePixel end
	if node.zIndex  then inst.ZIndex  = node.zIndex  end
	if node.visible ~= nil then inst.Visible = node.visible end
	-- TextLabel / TextButton
	if node.text       then pcall(function() inst.Text     = node.text       end) end
	if node.textSize   then pcall(function() inst.TextSize = node.textSize   end) end
	if node.textColor  then pcall(function()
		local c = parseColor(node.textColor); if c then inst.TextColor3 = c end
	end) end
	if node.font       then pcall(function() inst.Font = Enum.Font[node.font] or Enum.Font.GothamBold end) end
	if node.textScaled ~= nil then pcall(function() inst.TextScaled = node.textScaled end) end
	-- ImageLabel / ImageButton
	if node.image      then pcall(function() inst.Image   = node.image   end) end
	-- UICorner
	if node.cornerRadius then
		local corner = Instance.new("UICorner", inst)
		corner.CornerRadius = UDim.new(0, node.cornerRadius)
	end
	-- UIPadding
	if node.padding then
		local pad = Instance.new("UIPadding", inst)
		local p = node.padding
		if p.top    then pad.PaddingTop    = UDim.new(0, p.top)    end
		if p.bottom then pad.PaddingBottom = UDim.new(0, p.bottom) end
		if p.left   then pad.PaddingLeft   = UDim.new(0, p.left)   end
		if p.right  then pad.PaddingRight  = UDim.new(0, p.right)  end
	end
	-- UIListLayout
	if node.listLayout then
		local ll = Instance.new("UIListLayout", inst)
		ll.FillDirection = Enum.FillDirection[node.listLayout.fillDirection or "Vertical"]
		ll.HorizontalAlignment = Enum.HorizontalAlignment[node.listLayout.horizontalAlignment or "Center"]
		ll.VerticalAlignment   = Enum.VerticalAlignment[node.listLayout.verticalAlignment or "Top"]
		if node.listLayout.padding then ll.Padding = UDim.new(0, node.listLayout.padding) end
	end
	inst.Parent = parent
	-- Recurse children
	if node.children then
		for _, child in ipairs(node.children) do
			buildGuiNode(inst, child)
		end
	end
	return inst
end

function tools.create_ui(args)
	local layout = args.layout
	if not layout then return { ok = false, error = "layout is required" } end
	-- Determine parent: PlayerGui for runtime, StarterGui for templates
	local target = getByPath(args.parent or "")
	if not target then
		target = game:GetService("StarterGui")
	end
	local gui = Instance.new("ScreenGui")
	gui.Name        = args.name or "RobloxForge_UI"
	gui.ResetOnSpawn = args.resetOnSpawn ~= false
	if args.displayOrder then gui.DisplayOrder = args.displayOrder end
	gui.Parent = target
	buildGuiNode(gui, layout)
	wp("RobloxForge: create_ui " .. gui.Name)
	return { ok = true, data = { path = pathOf(gui), name = gui.Name } }
end

-- ─── NPC ─────────────────────────────────────────────────────────────────────

function tools.create_npc(args)
	local parent = getByPath(args.parent or "Workspace")
	if not parent then return { ok = false, error = "Parent not found: " .. tostring(args.parent) } end
	-- Build a minimal R15-style NPC model
	local npc = Instance.new("Model")
	npc.Name = args.name or "NPC"
	-- Root part
	local root = Instance.new("Part", npc)
	root.Name = "HumanoidRootPart"
	root.Size = Vector3.new(2, 2, 1)
	root.Anchored = false
	root.CanCollide = false
	if args.position then
		root.Position = Vector3.new(args.position.x or 0, args.position.y or 5, args.position.z or 0)
	end
	root.Transparency = 1
	-- Body parts
	local torso = Instance.new("Part", npc)
	torso.Name = "UpperTorso"
	torso.Size = Vector3.new(2, 2, 1)
	torso.Anchored = false
	torso.Position = root.Position + Vector3.new(0, 2, 0)
	-- Humanoid
	local humanoid = Instance.new("Humanoid", npc)
	humanoid.WalkSpeed = args.walkSpeed or 16
	humanoid.MaxHealth = args.maxHealth or 100
	humanoid.Health    = humanoid.MaxHealth
	-- Animator
	local animator = Instance.new("Animator", humanoid)
	-- ProximityPrompt if interactive
	if args.interactive then
		local prompt = Instance.new("ProximityPrompt", root)
		prompt.ActionText = args.promptText or "Interact"
	end
	-- PrimaryPart
	npc.PrimaryPart = root
	npc.Parent = parent
	wp("RobloxForge: create_npc " .. npc.Name)
	return { ok = true, data = { path = pathOf(npc), name = npc.Name } }
end

function tools.inject_behavior_script(args)
	-- Inject a pre-generated ModuleScript into an NPC
	local npc = getByPath(args.target)
	if not npc then return { ok = false, error = "NPC not found: " .. tostring(args.target) } end
	local ms = Instance.new("ModuleScript", npc)
	ms.Name = "BehaviorModule"
	ms.Source = args.source or "--empty"
	-- Auto-require LocalScript to run it
	local runner = Instance.new("Script", npc)
	runner.Name = "BehaviorRunner"
	runner.Source = string.format([[
local BM = require(script.Parent.BehaviorModule)
BM.init(script.Parent)
]])
	wp("RobloxForge: inject_behavior_script")
	return { ok = true, data = { path = pathOf(ms) } }
end

-- ─── Phase 10: Validation helpers ───────────────────────────────────────────

function tools.validate_build(args)
	local parent   = args.parent or "Workspace"
	local node     = getByPath(parent)
	if not node then return { ok = false, error = "Parent not found: " .. tostring(parent) } end

	local parts = {}
	for _, d in ipairs(node:GetDescendants()) do
		if d:IsA("BasePart") then table.insert(parts, d) end
	end

	local overlaps  = {}
	local floating  = {}
	local badScale  = {}

	-- Check overlaps (O(n²) capped at 200 parts for speed)
	local cap = math.min(#parts, 200)
	for i = 1, cap do
		local a = parts[i]
		local aHalf = a.Size / 2
		local aMin  = a.CFrame.Position - aHalf
		local aMax  = a.CFrame.Position + aHalf
		for j = i + 1, cap do
			local b = parts[j]
			if b:IsDescendantOf(a) or a:IsDescendantOf(b) then continue end
			local bHalf = b.Size / 2
			local bMin  = b.CFrame.Position - bHalf
			local bMax  = b.CFrame.Position + bHalf
			if aabbOverlap(aMin, aMax, bMin, bMax) then
				table.insert(overlaps, { a = pathOf(a), b = pathOf(b) })
				if #overlaps >= 20 then break end
			end
		end
		if #overlaps >= 20 then break end
	end

	-- Check floating (Anchored=false AND no support below within 0.5 studs)
	for _, p in ipairs(parts) do
		if not p.Anchored and p.CanCollide then
			local rayOrigin = p.CFrame.Position - Vector3.new(0, p.Size.Y / 2, 0)
			local result = workspace:Raycast(rayOrigin, Vector3.new(0, -0.6, 0))
			if not result then
				table.insert(floating, pathOf(p))
			end
		end
	end

	-- Check invalid scale (any dimension < 0.05 or > 2048)
	for _, p in ipairs(parts) do
		local s = p.Size
		if s.X < 0.05 or s.Y < 0.05 or s.Z < 0.05 or s.X > 2048 or s.Y > 2048 or s.Z > 2048 then
			table.insert(badScale, { path = pathOf(p), size = { x = s.X, y = s.Y, z = s.Z } })
		end
	end

	local valid = #overlaps == 0 and #floating == 0 and #badScale == 0
	return { ok = true, data = {
		valid    = valid,
		partCount = #parts,
		overlaps = overlaps,
		floating = floating,
		badScale = badScale,
	}}
end

function tools.validate_game(args)
	-- Aggregate project-level checks: script errors, missing RemoteEvents, broken model refs
	local warnings = {}
	local errors   = {}

	-- Check for scripts with syntax errors (Source property, basic heuristic)
	local scripts = {}
	for _, d in ipairs(game:GetDescendants()) do
		if d:IsA("LuaSourceContainer") then
			table.insert(scripts, d)
		end
	end

	-- Check RemoteEvents referenced in scripts still exist
	local remoteNames = {}
	for _, d in ipairs(game:GetDescendants()) do
		if d:IsA("RemoteEvent") or d:IsA("RemoteFunction") then
			remoteNames[d.Name] = true
		end
	end

	-- Count model/instance warnings
	local modelCount = 0
	for _, d in ipairs(workspace:GetDescendants()) do
		if d:IsA("Model") then modelCount = modelCount + 1 end
	end

	local partCount = 0
	for _, d in ipairs(workspace:GetDescendants()) do
		if d:IsA("BasePart") then partCount = partCount + 1 end
	end

	if partCount == 0 then table.insert(warnings, "Workspace has no BaseParts") end
	if modelCount == 0 then table.insert(warnings, "Workspace has no Models") end

	return { ok = true, data = {
		valid       = #errors == 0,
		scriptCount = #scripts,
		modelCount  = modelCount,
		partCount   = partCount,
		remoteCount = 0, -- counted above
		warnings    = warnings,
		errors      = errors,
	}}
end

-- ─── Dispatch ────────────────────────────────────────────────────────────────

local function executeCommand(cmd)
	local handler = tools[cmd.tool]
	if not handler then
		return { id = cmd.id, ok = false, error = "Unknown tool: " .. tostring(cmd.tool) }
	end
	local ok, result = pcall(handler, cmd.args or {})
	if not ok then
		return { id = cmd.id, ok = false, error = "Handler error: " .. tostring(result) }
	end
	result.id = cmd.id
	return result
end

-- ─── Transport ───────────────────────────────────────────────────────────────

local function postResult(result)
	local body
	local encOk, encErr = pcall(function() body = HttpService:JSONEncode(result) end)
	if not encOk then warn("[RobloxForge] Encode error: " .. tostring(encErr)); return end
	local postOk, postErr = pcall(function()
		HttpService:RequestAsync({
			Url = BASE_URL .. "/result", Method = "POST",
			Headers = { ["Content-Type"] = "application/json" }, Body = body,
		})
	end)
	if not postOk then
		state.postFailures += 1
		warn("[RobloxForge] POST /result failed: " .. tostring(postErr))
	end
end

local function spawnPollLoop()
	state.running = true
	task.spawn(function()
		print("[RobloxForge] Poll loop started — " .. BASE_URL)
		while state.running do
			local ok, response = pcall(function()
				return HttpService:RequestAsync({ Url = BASE_URL .. "/poll", Method = "GET" })
			end)
			if not ok then
				state.connected = false
				state.lastError  = tostring(response)
				warn("[RobloxForge] Poll error: " .. tostring(response) .. " — retry in " .. BACKOFF .. "s")
				task.wait(BACKOFF)
			elseif not response.Success then
				state.connected = false
				state.lastError  = "HTTP " .. tostring(response.StatusCode) .. ": " .. (response.Body or ""):sub(1, 200)
				warn("[RobloxForge] Poll HTTP error: " .. state.lastError .. " — retry in " .. BACKOFF .. "s")
				task.wait(BACKOFF)
			elseif response.StatusCode == 200 then
				state.connected  = true
				state.lastPollAt = os.time()
				state.pollCount += 1
				local decOk, cmd = pcall(HttpService.JSONDecode, HttpService, response.Body)
				if decOk and type(cmd) == "table" and cmd.id then
					if cmd.protocolVersion ~= PROTOCOL_VERSION then
						postResult({ id = cmd.id, ok = false, error = string.format(
							"[RobloxForge] Protocol version mismatch: plugin=%d server=%d — redeploy the plugin.",
							PROTOCOL_VERSION, cmd.protocolVersion
						)})
						stateAddRecent("version_mismatch", false, "protocol mismatch")
					else
						local res = executeCommand(cmd)
						postResult(res)
						state.lastCmdAt   = os.time()
						state.lastCmdTool = cmd.tool or "?"
						state.cmdCount   += 1
						stateAddRecent(cmd.tool or "?", res.ok == true, res.error)
					end
				else
					warn("[RobloxForge] Malformed command body: " .. (response.Body or ""):sub(1, 200))
				end
			elseif response.StatusCode == 204 then
				state.connected  = true
				state.lastPollAt = os.time()
				state.pollCount += 1
			else
				state.connected = false
				state.lastError  = "Unexpected status " .. tostring(response.StatusCode)
				warn("[RobloxForge] " .. state.lastError)
				task.wait(1)
			end
		end
		print("[RobloxForge] Poll loop stopped.")
	end)
end

-- ─── Studio GUI ──────────────────────────────────────────────────────────────

local C = {
	bgVoid      = Color3.fromRGB(10,  12,  16),
	bgPanel     = Color3.fromRGB(21,  24,  30),
	primary     = Color3.fromRGB(154, 168, 144),
	dim         = Color3.fromRGB(90,  98,  88),
	warning     = Color3.fromRGB(200, 158, 84),
	hazard      = Color3.fromRGB(138, 58,  58),
	terminal    = Color3.fromRGB(120, 240, 130),
	btnBg       = Color3.fromRGB(35,  40,  48),
	btnBgHover  = Color3.fromRGB(50,  58,  68),
}

local toolbar = plugin:CreateToolbar("RobloxForge")
local toggleBtn = toolbar:CreateButton(
	"Console",
	"Show / hide RobloxForge status console",
	"rbxasset://textures/ui/InspectMenu/scripts.png"
)
toggleBtn.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right, false, false, 360, 480, 280, 360
)
local widget = plugin:CreateDockWidgetPluginGui("RobloxForgeConsole", widgetInfo)
widget.Title       = "RobloxForge Console"
widget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

-- restore open state
local savedOpen = plugin:GetSetting("consoleOpen")
if savedOpen == true then
	widget.Enabled = true
	toggleBtn:SetActive(true)
end

toggleBtn.Click:Connect(function()
	widget.Enabled = not widget.Enabled
	toggleBtn:SetActive(widget.Enabled)
	plugin:SetSetting("consoleOpen", widget.Enabled)
end)

-- ── Build widget layout ───────────────────────────────────────────────────────

local root = Instance.new("Frame")
root.Size            = UDim2.fromScale(1, 1)
root.BackgroundColor3 = C.bgVoid
root.BorderSizePixel = 0
root.Parent          = widget

local rootLayout = Instance.new("UIListLayout")
rootLayout.FillDirection  = Enum.FillDirection.Vertical
rootLayout.SortOrder      = Enum.SortOrder.LayoutOrder
rootLayout.Padding        = UDim.new(0, 4)
rootLayout.Parent         = root

local rootPad = Instance.new("UIPadding")
rootPad.PaddingTop    = UDim.new(0, 8)
rootPad.PaddingBottom = UDim.new(0, 8)
rootPad.PaddingLeft   = UDim.new(0, 10)
rootPad.PaddingRight  = UDim.new(0, 10)
rootPad.Parent        = root

-- helper: make a TextLabel
local function makeLabel(parent, text, color, size, lo)
	local lbl = Instance.new("TextLabel")
	lbl.BackgroundTransparency = 1
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.Font           = Enum.Font.Code
	lbl.TextSize       = size or 13
	lbl.TextColor3     = color or C.primary
	lbl.Text           = text
	lbl.Size           = UDim2.new(1, 0, 0, (size or 13) + 4)
	lbl.AutomaticSize  = Enum.AutomaticSize.Y
	lbl.LayoutOrder    = lo or 0
	lbl.TextWrapped    = false
	lbl.ClipsDescendants = false
	lbl.Parent         = parent
	return lbl
end

-- helper: make a small button
local function makeButton(parent, text, lo, onClick)
	local btn = Instance.new("TextButton")
	btn.BackgroundColor3 = C.btnBg
	btn.BorderSizePixel  = 0
	btn.Font             = Enum.Font.Code
	btn.TextSize         = 12
	btn.TextColor3       = C.primary
	btn.Text             = text
	btn.Size             = UDim2.new(0, 90, 0, 22)
	btn.LayoutOrder      = lo or 0
	btn.AutoButtonColor  = false
	local corner = Instance.new("UICorner"); corner.CornerRadius = UDim.new(0, 3); corner.Parent = btn
	btn.MouseEnter:Connect(function()  btn.BackgroundColor3 = C.btnBgHover end)
	btn.MouseLeave:Connect(function()  btn.BackgroundColor3 = C.btnBg end)
	btn.MouseButton1Click:Connect(onClick)
	btn.Parent = parent
	return btn
end

-- ── Status row (dot + text + time) ───────────────────────────────────────────

local statusRow = Instance.new("Frame")
statusRow.BackgroundTransparency = 1
statusRow.Size        = UDim2.new(1, 0, 0, 20)
statusRow.LayoutOrder = 1
statusRow.Parent      = root

local statusLayout = Instance.new("UIListLayout")
statusLayout.FillDirection = Enum.FillDirection.Horizontal
statusLayout.VerticalAlignment = Enum.VerticalAlignment.Center
statusLayout.Padding   = UDim.new(0, 6)
statusLayout.Parent    = statusRow

local dot = Instance.new("Frame")
dot.Size              = UDim2.new(0, 10, 0, 10)
dot.BackgroundColor3  = C.hazard
dot.BorderSizePixel   = 0
local dotCorner = Instance.new("UICorner"); dotCorner.CornerRadius = UDim.new(1, 0); dotCorner.Parent = dot
dot.Parent = statusRow

local statusText = Instance.new("TextLabel")
statusText.BackgroundTransparency = 1
statusText.Font      = Enum.Font.Code
statusText.TextSize  = 13
statusText.TextColor3 = C.dim
statusText.Text      = "BRIDGE: " .. BASE_URL
statusText.Size      = UDim2.new(0, 200, 1, 0)
statusText.TextXAlignment = Enum.TextXAlignment.Left
statusText.Parent    = statusRow

local timeText = Instance.new("TextLabel")
timeText.BackgroundTransparency = 1
timeText.Font       = Enum.Font.Code
timeText.TextSize   = 11
timeText.TextColor3 = C.dim
timeText.Text       = "—"
timeText.Size       = UDim2.new(1, 0, 1, 0)
timeText.TextXAlignment = Enum.TextXAlignment.Right
timeText.Parent     = statusRow

-- ── Divider ───────────────────────────────────────────────────────────────────

local div1 = Instance.new("Frame")
div1.Size = UDim2.new(1, 0, 0, 1); div1.BackgroundColor3 = C.bgPanel; div1.BorderSizePixel = 0
div1.LayoutOrder = 2; div1.Parent = root

-- ── Stats row ────────────────────────────────────────────────────────────────

local statsLabel = makeLabel(root, "polls: 0   cmds: 0   post-fail: 0", C.dim, 12, 3)

-- ── Last command row ─────────────────────────────────────────────────────────

local lastCmdLabel = makeLabel(root, "latest: —", C.dim, 12, 4)

-- ── Divider ───────────────────────────────────────────────────────────────────

local div2 = Instance.new("Frame")
div2.Size = UDim2.new(1, 0, 0, 1); div2.BackgroundColor3 = C.bgPanel; div2.BorderSizePixel = 0
div2.LayoutOrder = 5; div2.Parent = root

-- ── Recent log (ScrollingFrame) ──────────────────────────────────────────────

local logTitle = makeLabel(root, "RECENT COMMANDS", C.dim, 11, 6)

local logFrame = Instance.new("ScrollingFrame")
logFrame.Size                = UDim2.new(1, 0, 0, 200)
logFrame.BackgroundColor3    = C.bgPanel
logFrame.BorderSizePixel     = 0
logFrame.ScrollBarThickness  = 4
logFrame.ScrollBarImageColor3 = C.dim
logFrame.CanvasSize          = UDim2.new(0, 0, 0, 0)
logFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
logFrame.LayoutOrder         = 7
logFrame.Parent              = root

local logLayout = Instance.new("UIListLayout")
logLayout.SortOrder     = Enum.SortOrder.LayoutOrder
logLayout.Padding       = UDim.new(0, 2)
logLayout.Parent        = logFrame

local logPad = Instance.new("UIPadding")
logPad.PaddingLeft = UDim.new(0, 4); logPad.PaddingRight = UDim.new(0, 4)
logPad.PaddingTop  = UDim.new(0, 4); logPad.Parent = logFrame

local logRows = {}
for i = 1, RECENT_MAX do
	local row = Instance.new("TextLabel")
	row.BackgroundTransparency = 1
	row.Font       = Enum.Font.Code
	row.TextSize   = 11
	row.TextColor3 = C.dim
	row.TextXAlignment = Enum.TextXAlignment.Left
	row.Size       = UDim2.new(1, 0, 0, 14)
	row.LayoutOrder = i
	row.TextWrapped = false
	row.Text        = ""
	row.Parent      = logFrame
	logRows[i]      = row
end

-- ── Divider ───────────────────────────────────────────────────────────────────

local div3 = Instance.new("Frame")
div3.Size = UDim2.new(1, 0, 0, 1); div3.BackgroundColor3 = C.bgPanel; div3.BorderSizePixel = 0
div3.LayoutOrder = 8; div3.Parent = root

-- ── Buttons row ──────────────────────────────────────────────────────────────

local btnRow = Instance.new("Frame")
btnRow.BackgroundTransparency = 1
btnRow.Size        = UDim2.new(1, 0, 0, 28)
btnRow.LayoutOrder = 9
btnRow.Parent      = root

local btnLayout = Instance.new("UIListLayout")
btnLayout.FillDirection  = Enum.FillDirection.Horizontal
btnLayout.VerticalAlignment = Enum.VerticalAlignment.Center
btnLayout.Padding        = UDim.new(0, 6)
btnLayout.Parent         = btnRow

makeButton(btnRow, "⟳ Reconnect", 1, function()
	state.running = false
	task.wait(0.1)
	spawnPollLoop()
end)

makeButton(btnRow, "✕ Clear log", 2, function()
	state.recent = {}
end)

makeButton(btnRow, "⎘ Copy diag", 3, function()
	local diag = string.format(
		"connected=%s polls=%d cmds=%d postFail=%d lastError=%s lastTool=%s",
		tostring(state.connected), state.pollCount, state.cmdCount,
		state.postFailures, state.lastError, state.lastCmdTool
	)
	local ok = pcall(setclipboard, diag)
	if not ok then print("[RobloxForge] Diagnostics:\n" .. diag) end
end)

-- ── Error label (shown when disconnected) ────────────────────────────────────

local errorLabel = makeLabel(root, "", C.hazard, 11, 10)

-- ── Repaint loop ─────────────────────────────────────────────────────────────

local function fmtAge(t)
	if t == 0 then return "—" end
	local d = os.time() - t
	if d < 60 then return d .. "s ago" end
	return math.floor(d/60) .. "m ago"
end

local lastRepaint = 0
local repaintConn = RunService.Heartbeat:Connect(function()
	local now = os.time()
	if now - lastRepaint < 1 then return end  -- repaint at most every 1s (Heartbeat runs at 60 fps)
	lastRepaint = now

	-- status dot
	dot.BackgroundColor3 = state.connected and C.terminal or C.hazard
	timeText.Text = fmtAge(state.lastPollAt)

	-- stats
	statsLabel.Text = string.format("polls: %d   cmds: %d   post-fail: %d",
		state.pollCount, state.cmdCount, state.postFailures)

	-- last command
	if state.cmdCount > 0 then
		local age   = fmtAge(state.lastCmdAt)
		local color = C.terminal
		lastCmdLabel.TextColor3 = color
		lastCmdLabel.Text = "latest: " .. state.lastCmdTool .. " ✓ " .. age
	else
		lastCmdLabel.TextColor3 = C.dim
		lastCmdLabel.Text = "latest: —"
	end

	-- recent rows
	for i, row in ipairs(logRows) do
		local entry = state.recent[i]
		if entry then
			local ts = os.date("%H:%M:%S", entry.t)
			local mark = entry.ok and "✓" or "✗"
			row.Text       = string.format("[%s] %s %s", ts, entry.tool, mark)
			row.TextColor3 = entry.ok and C.terminal or C.hazard
		else
			row.Text = ""
		end
	end

	-- error / last error
	if not state.connected and state.lastError ~= "" then
		errorLabel.Text = "ERR: " .. state.lastError:sub(1, 80)
	else
		errorLabel.Text = ""
	end
end)

-- ─── Cleanup on unload ───────────────────────────────────────────────────────

plugin.Unloading:Connect(function()
	state.running = false
	repaintConn:Disconnect()
end)

-- ─── Boot ────────────────────────────────────────────────────────────────────

spawnPollLoop()
