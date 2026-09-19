import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useGradeAnswer, getGetClassroomHistoryQueryKey, type GradeResult } from "../lib/api-client";
import { useAuth } from "../lib/auth-context";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { GraduationCap, Loader2, CheckCircle, AlertCircle, Camera, Image as ImageIcon, X } from "lucide-react";

const formSchema = z.object({
  question: z.string().min(2, "Question is required"),
  studentAnswer: z.string().optional(),
  rubric: z.string().optional(),
  maxMarks: z.coerce.number().min(1).max(100),
  strictness: z.enum(["lenient", "moderate", "strict"]),
});

export function Grade() {
  const [result, setResult] = useState<GradeResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const gradeAnswer = useGradeAnswer(user?.id);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      question: "",
      studentAnswer: "",
      rubric: "",
      maxMarks: 10,
      strictness: "moderate",
    },
  });

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!values.studentAnswer && !capturedImage) {
      alert("Please enter a text answer or take/upload a photo of the answer sheet.");
      return;
    }

    setResult(null);
    gradeAnswer.mutate(
      { data: { ...values, image: capturedImage } },
      {
        onSuccess: (data) => {
          setResult(data);
          queryClient.invalidateQueries({ queryKey: getGetClassroomHistoryQueryKey(user?.id) });
        },
      }
    );
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (percentage >= 75) return "text-brand-600 bg-brand-50 border-brand-200";
    if (percentage >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-serif font-bold text-foreground">AI Answer Grader</h1>
        <p className="text-muted-foreground mt-2">Evaluate student answers via Text or Camera Photo with customizable strictness.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <Card className="p-6 border-border/50">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="question"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Original Question</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Question details..." className="resize-none" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Student Answer (Type OR Click Photo)</FormLabel>
                <FormField
                  control={form.control}
                  name="studentAnswer"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea placeholder="Paste typed student response (optional if photo attached)..." className="resize-none" rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Camera / Photo Upload */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleImageCapture}
                  className="hidden"
                />

                {capturedImage ? (
                  <div className="relative mt-2 p-2 border rounded-lg bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={capturedImage} alt="Sheet" className="w-14 h-14 object-cover rounded" />
                      <span className="text-xs text-slate-600 font-medium">Answer Sheet Photo Attached</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCapturedImage(null)}>
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full flex items-center gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="w-4 h-4 text-brand-600" />
                      Take Photo / Upload Sheet
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="maxMarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Marks</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="strictness"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grading Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Strictness" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="lenient">Lenient (Encouraging)</SelectItem>
                          <SelectItem value="moderate">Moderate (Standard)</SelectItem>
                          <SelectItem value="strict">Strict (University/Exam)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="rubric"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grading Rubric / Key Points (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Specify key points to look for..." className="resize-none" rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={gradeAnswer.isPending}>
                {gradeAnswer.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    AI is Evaluating Answer...
                  </>
                ) : (
                  <>
                    <GraduationCap className="mr-2 h-4 w-4" />
                    Grade Answer
                  </>
                )}
              </Button>
            </form>
          </Form>
        </Card>

        <div>
          {gradeAnswer.isPending && (
            <Card className="h-full min-h-[500px] flex flex-col items-center justify-center text-muted-foreground border-border/50">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50 mb-4" />
              <p>Analyzing handwriting & conceptual correctness...</p>
            </Card>
          )}

          {!gradeAnswer.isPending && result && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <Card className="p-8 border-border/50 flex flex-col items-center justify-center">
                <div className={`w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center mb-4 ${getScoreColor(result.percentage)}`}>
                  <span className="text-4xl font-serif font-bold">{result.marksAwarded}</span>
                  <span className="text-sm font-medium opacity-70">/ {result.maxMarks}</span>
                </div>
                <h3 className="text-2xl font-serif font-bold mb-1">Grade: {result.grade}</h3>
                <p className="text-muted-foreground text-center max-w-md mt-2">{result.feedback}</p>
              </Card>

              <div className="grid gap-6">
                <Card className="p-6 border-emerald-100 bg-emerald-50/50">
                  <h4 className="flex items-center text-emerald-800 font-medium mb-3">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Strengths
                  </h4>
                  <ul className="space-y-2">
                    {result.strengths.map((str, i) => (
                      <li key={i} className="flex items-start text-emerald-900 text-sm">
                        <span className="mr-2 mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {str}
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card className="p-6 border-amber-100 bg-amber-50/50">
                  <h4 className="flex items-center text-amber-800 font-medium mb-3">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    Areas for Improvement
                  </h4>
                  <ul className="space-y-2">
                    {result.improvements.map((imp, i) => (
                      <li key={i} className="flex items-start text-amber-900 text-sm">
                        <span className="mr-2 mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        {imp}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          )}

          {!gradeAnswer.isPending && !result && (
            <div className="h-full min-h-[500px] border-2 border-dashed border-border/50 rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
              <GraduationCap className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p>Submit text or capture sheet photo to get detailed grading.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
