' Started by Windows Task Scheduler ("Nomadic scrapers"): runs the scrapers that are due, without a window.
' Output goes to logs\auto-<year-month>.log; results to reports\.
Set fso = CreateObject("Scripting.FileSystemObject")
binDir = fso.GetParentFolderName(WScript.ScriptFullName)
folder = fso.GetParentFolderName(binDir)
node = "node"
nodeFile = binDir & "\node-path.txt"
If fso.FileExists(nodeFile) Then
  Set f = fso.OpenTextFile(nodeFile, 1)
  saved = Trim(f.ReadAll)
  f.Close
  If saved <> "" And fso.FileExists(saved) Then node = saved
End If
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = folder
shell.Run """" & node & """ """ & binDir & "\nomadic-scrapers.mjs"" auto --home """ & folder & """", 0, True
